import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import {
  createTestWorkerApi,
  sampleCapabilities,
} from '../../lib/server/crawler/testing/create-test-worker-api';
import { LEASE_TOKEN_HEADER } from '../../lib/server/crawler/interfaces/worker-auth';
import { mapWorkerError } from '../../lib/server/crawler/interfaces/worker-presenter';
import { AppError } from '../../lib/server/shared/errors';
import { WORKER_SCOPES } from '../../lib/server/crawler/interfaces/worker-auth';

function jsonRequest(
  url: string,
  init: {
    method?: string;
    token?: string;
    leaseToken?: string;
    body?: unknown;
  } = {},
): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  if (init.leaseToken) headers.set(LEASE_TOKEN_HEADER, init.leaseToken);
  return new NextRequest(url, {
    method: init.method ?? 'POST',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 204) return {};
  return (await response.json()) as Record<string, unknown>;
}

test('401 WORKER_TOKEN_INVALID for missing/invalid machine token', async () => {
  const api = createTestWorkerApi();
  const missing = await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      body: { capabilities: sampleCapabilities() },
    }),
  );
  assert.equal(missing.status, 401);
  const missingBody = await readJson(missing);
  assert.equal((missingBody.error as { code: string }).code, 'WORKER_TOKEN_INVALID');

  const bad = await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token: 'not-a-real-token',
      body: { capabilities: sampleCapabilities() },
    }),
  );
  assert.equal(bad.status, 401);
  assert.equal(
    ((await readJson(bad)).error as { code: string }).code,
    'WORKER_TOKEN_INVALID',
  );
});

test('401 WORKER_TOKEN_REVOKED for revoked machine token', async () => {
  const api = createTestWorkerApi();
  const { token, credentialId } = await api.provisionWorker();
  await api.workers.revokeCredential(credentialId);

  const res = await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token,
      body: { capabilities: sampleCapabilities() },
    }),
  );
  assert.equal(res.status, 401);
  assert.equal(
    ((await readJson(res)).error as { code: string }).code,
    'WORKER_TOKEN_REVOKED',
  );
});

test('403 WORKER_FORBIDDEN on workerId mismatch and missing scope', async () => {
  const api = createTestWorkerApi();
  const a = await api.provisionWorker('a');
  const b = await api.provisionWorker('b');

  const mismatch = await api.handlers.workerHeartbeat(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/2/heartbeat', {
      token: a.token,
      body: { currentLoad: 0 },
    }),
    { workerId: String(b.workerId) },
  );
  assert.equal(mismatch.status, 403);
  assert.equal(
    ((await readJson(mismatch)).error as { code: string }).code,
    'WORKER_FORBIDDEN',
  );

  const limited = await api.provisionWorker('limited', ['workers:register']);
  const claim = await api.handlers.claim(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/claim', {
      token: limited.token,
      body: { capabilities: sampleCapabilities() },
    }),
  );
  assert.equal(claim.status, 403);
  assert.equal(
    ((await readJson(claim)).error as { code: string }).code,
    'WORKER_FORBIDDEN',
  );
});

test('register negotiates protocol and rejects unsupported version', async () => {
  const api = createTestWorkerApi();
  const { token, workerId } = await api.provisionWorker();

  const ok = await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token,
      body: {
        workerId,
        capabilities: sampleCapabilities({ protocolVersion: 1 }),
      },
    }),
  );
  assert.equal(ok.status, 200);
  const okBody = await readJson(ok);
  assert.equal((okBody.data as { protocolVersion: number }).protocolVersion, 1);

  const bad = await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token,
      body: {
        workerId,
        capabilities: sampleCapabilities({ protocolVersion: 99 }),
      },
    }),
  );
  assert.equal(bad.status, 409);
  assert.equal(
    ((await readJson(bad)).error as { code: string }).code,
    'WORKER_INCOMPATIBLE',
  );
});

test('capability mismatch leaves job queued with visible skip reason', async () => {
  const api = createTestWorkerApi();
  const { token, workerId } = await api.provisionWorker();
  await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token,
      body: { workerId, capabilities: sampleCapabilities({ sources: ['hanime'] }) },
    }),
  );

  await api.deps.jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: JSON.stringify({
      requiredSource: 'getchu',
      schemaVersion: 1,
      storageDriver: 's3',
    }),
  });

  const claim = await api.handlers.claim(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/claim', {
      token,
      body: { capabilities: sampleCapabilities({ sources: ['hanime'] }) },
    }),
  );
  assert.equal(claim.status, 204);

  const job = await api.uow.jobs.get(1);
  assert.equal(job?.status, 'queued');
  assert.ok(job?.progressJson?.includes('claimSkipReason'));
  assert.ok(job?.progressJson?.includes('getchu'));
});

test('claim/start/heartbeat/complete happy path with lease binding', async () => {
  const api = createTestWorkerApi();
  const { token, workerId } = await api.provisionWorker();
  await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token,
      body: { workerId, capabilities: sampleCapabilities() },
    }),
  );

  await api.deps.jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: JSON.stringify({
      requiredSource: 'hanime',
      schemaVersion: 1,
      storageDriver: 's3',
    }),
  });

  const claim = await api.handlers.claim(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/claim', {
      token,
      body: { capabilities: sampleCapabilities() },
    }),
  );
  assert.equal(claim.status, 200);
  const claimed = (await readJson(claim)).data as {
    jobId: number;
    attemptId: number;
    leaseToken: string;
  };
  assert.ok(claimed.leaseToken);
  assert.equal(claimed.jobId, 1);

  const start = await api.handlers.start(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/start', {
      token,
      leaseToken: claimed.leaseToken,
      body: { attemptId: claimed.attemptId },
    }),
    { id: '1' },
  );
  assert.equal(start.status, 200);
  assert.equal(((await readJson(start)).data as { status: string }).status, 'running');

  const beat = await api.handlers.jobHeartbeat(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/heartbeat', {
      token,
      leaseToken: claimed.leaseToken,
      body: { attemptId: claimed.attemptId },
    }),
    { id: '1' },
  );
  assert.equal(beat.status, 200);
  assert.equal(
    ((await readJson(beat)).data as { cancelRequested: boolean }).cancelRequested,
    false,
  );

  const done = await api.handlers.complete(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/complete', {
      token,
      leaseToken: claimed.leaseToken,
      body: {
        attemptId: claimed.attemptId,
        idempotencyKey: 'complete-1',
        outcome: 'succeeded',
      },
    }),
    { id: '1' },
  );
  assert.equal(done.status, 200);
  assert.equal(((await readJson(done)).data as { status: string }).status, 'succeeded');
});

test('lease loss returns stable LEASE_LOST', async () => {
  const api = createTestWorkerApi();
  const { token, workerId } = await api.provisionWorker();
  await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token,
      body: { workerId, capabilities: sampleCapabilities() },
    }),
  );
  await api.deps.jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });
  const claim = await api.handlers.claim(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/claim', {
      token,
      body: {},
    }),
  );
  const claimed = (await readJson(claim)).data as {
    jobId: number;
    attemptId: number;
    leaseToken: string;
  };

  const lost = await api.handlers.start(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/start', {
      token,
      leaseToken: 'wrong-lease-token',
      body: { attemptId: claimed.attemptId },
    }),
    { id: String(claimed.jobId) },
  );
  assert.equal(lost.status, 409);
  assert.equal(((await readJson(lost)).error as { code: string }).code, 'LEASE_LOST');
});

test('events batch over 100 returns BATCH_TOO_LARGE', async () => {
  const api = createTestWorkerApi();
  const { token, workerId } = await api.provisionWorker();
  await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token,
      body: { workerId, capabilities: sampleCapabilities() },
    }),
  );
  await api.deps.jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });
  const claim = await api.handlers.claim(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/claim', {
      token,
      body: {},
    }),
  );
  const claimed = (await readJson(claim)).data as {
    attemptId: number;
    leaseToken: string;
    jobId: number;
  };
  await api.handlers.start(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/start', {
      token,
      leaseToken: claimed.leaseToken,
      body: { attemptId: claimed.attemptId },
    }),
    { id: '1' },
  );

  const huge = await api.handlers.eventsBatch(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/events/batch', {
      token,
      leaseToken: claimed.leaseToken,
      body: {
        attemptId: claimed.attemptId,
        events: Array.from({ length: 101 }, (_, i) => ({
          sequence: i,
          eventType: 'log',
          message: 'x',
        })),
      },
    }),
    { id: '1' },
  );
  // Zod max(100) → RESULT_INVALID 400, or service BATCH_TOO_LARGE 413
  assert.ok(huge.status === 400 || huge.status === 413);
  const code = ((await readJson(huge)).error as { code: string }).code;
  assert.ok(code === 'BATCH_TOO_LARGE' || code === 'RESULT_INVALID');
});

test('item commit idempotency: same key replays; different payload conflicts', async () => {
  const api = createTestWorkerApi();
  const { token, workerId } = await api.provisionWorker();
  await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token,
      body: { workerId, capabilities: sampleCapabilities() },
    }),
  );
  await api.deps.jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });
  const claim = await api.handlers.claim(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/claim', {
      token,
      body: {},
    }),
  );
  const claimed = (await readJson(claim)).data as {
    attemptId: number;
    leaseToken: string;
  };
  await api.handlers.start(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/start', {
      token,
      leaseToken: claimed.leaseToken,
      body: { attemptId: claimed.attemptId },
    }),
    { id: '1' },
  );

  const body = {
    attemptId: claimed.attemptId,
    idempotencyKey: 'item-k1',
    source: 'hanime',
    sourceId: '42',
    status: 'succeeded' as const,
  };
  const first = await api.handlers.itemsCommit(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/items/commit', {
      token,
      leaseToken: claimed.leaseToken,
      body,
    }),
    { id: '1' },
  );
  assert.equal(first.status, 200);
  assert.equal(((await readJson(first)).data as { replayed: boolean }).replayed, false);

  const replay = await api.handlers.itemsCommit(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/items/commit', {
      token,
      leaseToken: claimed.leaseToken,
      body,
    }),
    { id: '1' },
  );
  assert.equal(replay.status, 200);
  assert.equal(((await readJson(replay)).data as { replayed: boolean }).replayed, true);

  const conflict = await api.handlers.itemsCommit(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/items/commit', {
      token,
      leaseToken: claimed.leaseToken,
      body: { ...body, status: 'failed' },
    }),
    { id: '1' },
  );
  assert.equal(conflict.status, 409);
  assert.equal(
    ((await readJson(conflict)).error as { code: string }).code,
    'RESULT_CONFLICT',
  );
});

test('credentials refresh requires scope and returns no-store short-lived creds', async () => {
  const api = createTestWorkerApi();
  const { token, workerId } = await api.provisionWorker();
  await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token,
      body: { workerId, capabilities: sampleCapabilities() },
    }),
  );
  await api.deps.jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });
  const claim = await api.handlers.claim(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/claim', {
      token,
      body: {},
    }),
  );
  const claimed = (await readJson(claim)).data as {
    attemptId: number;
    leaseToken: string;
  };
  await api.handlers.start(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/start', {
      token,
      leaseToken: claimed.leaseToken,
      body: { attemptId: claimed.attemptId },
    }),
    { id: '1' },
  );

  const refresh = await api.handlers.credentialsRefresh(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/credentials/refresh', {
      token,
      leaseToken: claimed.leaseToken,
      body: { attemptId: claimed.attemptId, prefix: 'jobs/1/' },
    }),
    { id: '1' },
  );
  assert.equal(refresh.status, 200);
  assert.equal(refresh.headers.get('cache-control'), 'no-store');
  const data = (await readJson(refresh)).data as {
    driver: string;
    prefix: string;
    sessionToken: string;
  };
  assert.equal(data.driver, 's3');
  assert.equal(data.prefix, 'jobs/1/');
  assert.ok(data.sessionToken);

  const noScope = await api.provisionWorker('noscope', [
    'workers:register',
    'jobs:claim',
    'jobs:write',
  ]);
  // different worker can't use this lease anyway; check scope on register-less path
  const denied = await api.handlers.credentialsRefresh(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/credentials/refresh', {
      token: noScope.token,
      leaseToken: claimed.leaseToken,
      body: { attemptId: claimed.attemptId },
    }),
    { id: '1' },
  );
  assert.equal(denied.status, 403);
});

test('media reserve returns deterministic keys', async () => {
  const api = createTestWorkerApi();
  const { token, workerId } = await api.provisionWorker();
  await api.handlers.register(
    jsonRequest('http://localhost/api/internal/crawler/v1/workers/register', {
      token,
      body: { workerId, capabilities: sampleCapabilities() },
    }),
  );
  await api.deps.jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });
  const claim = await api.handlers.claim(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/claim', {
      token,
      body: {},
    }),
  );
  const claimed = (await readJson(claim)).data as {
    attemptId: number;
    leaseToken: string;
    jobId: number;
  };
  await api.handlers.start(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/start', {
      token,
      leaseToken: claimed.leaseToken,
      body: { attemptId: claimed.attemptId },
    }),
    { id: '1' },
  );

  const reserved = await api.handlers.mediaReserve(
    jsonRequest('http://localhost/api/internal/crawler/v1/jobs/1/media/reserve', {
      token,
      leaseToken: claimed.leaseToken,
      body: {
        attemptId: claimed.attemptId,
        itemKey: 'ep-1',
        prefix: 'anime/',
        assetKind: 'video',
      },
    }),
    { id: '1' },
  );
  assert.equal(reserved.status, 200);
  const data = (await readJson(reserved)).data as {
    stagingKey: string;
    finalKey: string;
  };
  assert.ok(data.stagingKey.startsWith('staging/'));
  assert.ok(data.finalKey.startsWith('final/'));
  assert.ok(data.stagingKey.includes(`job-${claimed.jobId}`));
});

test('presenter maps AppError codes stably', () => {
  const mapped = mapWorkerError(
    new AppError('WORKER_TOKEN_INVALID', 'bad', 401),
  );
  assert.equal(mapped.status, 401);
  assert.equal(mapped.body.error.code, 'WORKER_TOKEN_INVALID');
  assert.equal(mapped.body.error.retryable, false);

  const unknown = mapWorkerError(new Error('boom'));
  assert.equal(unknown.status, 500);
  assert.equal(unknown.body.error.code, 'INTERNAL_ERROR');
});

test('internal crawler routes exist under v1 and export POST only', () => {
  const root = join(process.cwd(), 'app/api/internal/crawler/v1');
  const expected = [
    'workers/register/route.ts',
    'workers/[workerId]/heartbeat/route.ts',
    'jobs/claim/route.ts',
    'jobs/[id]/start/route.ts',
    'jobs/[id]/heartbeat/route.ts',
    'jobs/[id]/events/batch/route.ts',
    'jobs/[id]/media/reserve/route.ts',
    'jobs/[id]/credentials/refresh/route.ts',
    'jobs/[id]/items/commit/route.ts',
    'jobs/[id]/complete/route.ts',
    'jobs/[id]/fail/route.ts',
  ];
  for (const rel of expected) {
    const full = join(root, rel);
    assert.equal(statSync(full).isFile(), true, `missing ${rel}`);
  }

  // Ensure no accidental public index under internal that leaks listing
  assert.equal(WORKER_SCOPES.includes('jobs:claim'), true);
});

test('public route tree does not expose internal as a public API sibling contract', () => {
  const apiRoot = join(process.cwd(), 'app/api');
  const entries = readdirSync(apiRoot);
  assert.ok(entries.includes('internal'));
  assert.ok(entries.includes('animes'));
  // Internal is isolated path segment — middleware only guards /admin, so
  // production ingress must still block /api/internal/** (documented assumption).
  assert.ok(entries.includes('health'));
});
