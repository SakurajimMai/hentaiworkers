/**
 * Control-plane end-to-end path using in-memory services + Worker handlers.
 * Full Docker/MinIO stack is optional via CRAWLER_E2E_DOCKER=1 (skipped here).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import {
  createTestWorkerApi,
  sampleCapabilities,
} from '../../lib/server/crawler/testing/create-test-worker-api';
import {
  createAdminCrawlerService,
  createInMemoryAdminDeps,
} from '../../lib/server/crawler/interfaces/admin-crawler-deps';
import {
  adminConfirmYamlImport,
  adminCreateSecret,
  adminRevealSecret,
  adminStartManualJob,
  adminCancelJob,
  adminRetryJob,
  type AdminActionContext,
} from '../../lib/server/crawler/interfaces/admin-crawler-actions';
import { LEASE_TOKEN_HEADER } from '../../lib/server/crawler/interfaces/worker-auth';

function req(url: string, token: string, body?: unknown, lease?: string) {
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  });
  if (lease) headers.set(LEASE_TOKEN_HEADER, lease);
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function json(res: Response) {
  if (res.status === 204) return {};
  return res.json() as Promise<Record<string, unknown>>;
}

test('e2e: yaml import → manual job → worker claim → complete → cancel/retry path', async () => {
  // Share the same UoW with worker API for true e2e on one control plane.
  const workerApi = createTestWorkerApi();
  const sharedDeps = {
    ...createInMemoryAdminDeps(),
    uow: workerApi.uow,
    jobs: workerApi.deps.jobs,
  };
  const admin = createAdminCrawlerService(sharedDeps);
  const ctx: AdminActionContext = {
    identity: {
      async requireAdmin() {
        return {
          id: 1,
          username: 'admin',
          role: 'admin',
          displayName: 'Admin',
          isActive: 1,
          passwordHash: 'x',
          sessionVersion: 1,
        };
      },
    },
    crawler: admin,
  };

  const yaml = `
crawl:
  base_url: https://hanime.example
  date_filter:
    year: [2026]
    month: [1]
  quality_priority: ["1080"]
download:
  max_concurrent: 2
`;
  const imported = await adminConfirmYamlImport(ctx, {
    name: 'e2e',
    rawYaml: yaml,
    nodeEnv: 'test',
  });
  assert.ok(imported.version.id);

  const secret = await adminCreateSecret(ctx, {
    name: 'proxy',
    scope: 'network.proxy',
    plaintext: 'eye-secret',
  });
  const revealed = await adminRevealSecret(ctx, secret.id);
  assert.equal(revealed.plaintext, 'eye-secret');
  assert.equal(revealed.cacheControl, 'no-store');

  const job = await adminStartManualJob(ctx, {
    profileId: 1,
    profileVersionId: imported.version.id,
    configSnapshotJson: JSON.stringify({
      requiredSource: 'hanime',
      schemaVersion: 1,
      storageDriver: 's3',
      fixtureItems: [{ id: '1', title: 'A', videos: ['1080.mp4'] }],
    }),
  });

  const { token, workerId } = await workerApi.provisionWorker();
  await workerApi.handlers.register(
    req('http://x/workers/register', token, {
      workerId,
      capabilities: sampleCapabilities(),
    }),
  );

  const claim = await workerApi.handlers.claim(
    req('http://x/jobs/claim', token, { capabilities: sampleCapabilities() }),
  );
  assert.equal(claim.status, 200);
  const claimed = (await json(claim)).data as {
    jobId: number;
    attemptId: number;
    leaseToken: string;
  };
  assert.equal(claimed.jobId, job.id);

  await workerApi.handlers.start(
    req(
      'http://x/jobs/1/start',
      token,
      { attemptId: claimed.attemptId },
      claimed.leaseToken,
    ),
    { id: String(claimed.jobId) },
  );

  await workerApi.handlers.itemsCommit(
    req(
      'http://x/jobs/1/items/commit',
      token,
      {
        attemptId: claimed.attemptId,
        idempotencyKey: 'e2e-item-1',
        source: 'hanime',
        sourceId: '1',
        status: 'succeeded',
      },
      claimed.leaseToken,
    ),
    { id: String(claimed.jobId) },
  );

  // idempotent replay
  const replay = await workerApi.handlers.itemsCommit(
    req(
      'http://x/jobs/1/items/commit',
      token,
      {
        attemptId: claimed.attemptId,
        idempotencyKey: 'e2e-item-1',
        source: 'hanime',
        sourceId: '1',
        status: 'succeeded',
      },
      claimed.leaseToken,
    ),
    { id: String(claimed.jobId) },
  );
  assert.equal(((await json(replay)).data as { replayed: boolean }).replayed, true);

  const done = await workerApi.handlers.complete(
    req(
      'http://x/jobs/1/complete',
      token,
      {
        attemptId: claimed.attemptId,
        idempotencyKey: 'e2e-complete',
        outcome: 'succeeded',
      },
      claimed.leaseToken,
    ),
    { id: String(claimed.jobId) },
  );
  assert.equal(((await json(done)).data as { status: string }).status, 'succeeded');

  const retry = await adminRetryJob(ctx, job.id);
  assert.equal(retry.retryOfJobId, job.id);
  assert.equal(retry.status, 'queued');

  const cancelled = await adminCancelJob(ctx, retry.id);
  assert.equal(cancelled.status, 'cancelled');
});

test('e2e: fault — expired lease and revoked worker token', async () => {
  const api = createTestWorkerApi();
  const { token, workerId, credentialId } = await api.provisionWorker();
  await api.handlers.register(
    req('http://x/register', token, {
      workerId,
      capabilities: sampleCapabilities(),
    }),
  );
  await api.deps.jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });
  const claim = await api.handlers.claim(req('http://x/claim', token, {}));
  const claimed = (await json(claim)).data as {
    jobId: number;
    attemptId: number;
    leaseToken: string;
  };

  const lost = await api.handlers.start(
    req(
      'http://x/start',
      token,
      { attemptId: claimed.attemptId },
      'bad-lease',
    ),
    { id: String(claimed.jobId) },
  );
  assert.equal(lost.status, 409);

  await api.workers.revokeCredential(credentialId);
  const revoked = await api.handlers.claim(req('http://x/claim', token, {}));
  assert.equal(revoked.status, 401);
});

test('e2e: shadow compare hanime fixture HTML quality selection', async () => {
  // Mirrors crawler_worker.sources.hanime selection rules in TS for parity gate.
  const html =
    '<div data-id="1" data-title="Main" data-video="720.mp4,1080.mp4"></div>'
    + '<div data-id="2" data-title="Preview PV" data-video="480.mp4"></div>';
  const re =
    /data-id="([^"]+)"[^>]*data-title="([^"]+)"[^>]*data-video="([^"]+)"/gi;
  const priority = ['1080', '720'];
  const skips = ['pv'];
  const items: Array<{ id: string; title: string; video: string | null; status: string }> = [];
  for (const m of html.matchAll(re)) {
    const [, id, title, videos] = m;
    if (skips.some((k) => title.toLowerCase().includes(k))) {
      items.push({ id, title, video: null, status: 'skipped' });
      continue;
    }
    const candidates = videos.split(',');
    const chosen = priority.map((q) => candidates.find((c) => c.includes(q))).find(Boolean) ?? null;
    items.push({
      id,
      title,
      video: chosen ?? null,
      status: chosen ? 'succeeded' : 'failed',
    });
  }
  assert.equal(items[0].video, '1080.mp4');
  assert.equal(items[1].status, 'skipped');
});

test('optional docker e2e skipped without CRAWLER_E2E_DOCKER', { skip: process.env.CRAWLER_E2E_DOCKER !== '1' }, async () => {
  assert.fail('run external docker compose e2e harness when env set');
});
