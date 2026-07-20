import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AdminCrawlerService } from '../../lib/server/crawler/application/admin-crawler-service';
import { hashOpaqueToken } from '../../lib/server/crawler/domain/hashing';
import { createInMemoryAdminDeps } from '../../lib/server/crawler/interfaces/admin-crawler-deps';
import { WorkerAuthService, WORKER_SCOPES } from '../../lib/server/crawler/interfaces/worker-auth';

test('admin provisions a worker with a one-time plaintext token', async () => {
  const deps = createInMemoryAdminDeps();
  const service = new AdminCrawlerService(deps);

  const provisioned = await service.provisionWorker('primary worker');

  assert.ok(provisioned.token.length >= 32);
  assert.equal(provisioned.worker.name, 'primary worker');
  assert.deepEqual(provisioned.scopes, [...WORKER_SCOPES]);

  const auth = await new WorkerAuthService(deps.workers).authenticate(
    `Bearer ${provisioned.token}`,
  );
  assert.equal(auth.worker.id, provisioned.worker.id);

  await assert.rejects(
    () => service.provisionWorker('x'.repeat(129)),
    /最多 128 个字符/,
  );
});

test('admin revokes a worker credential', async () => {
  const deps = createInMemoryAdminDeps();
  const service = new AdminCrawlerService(deps);
  const provisioned = await service.provisionWorker('revoked worker');

  await service.revokeWorkerCredential(provisioned.worker.id, provisioned.credentialId);
  await service.revokeWorkerCredential(provisioned.worker.id, provisioned.credentialId);

  await assert.rejects(
    () => new WorkerAuthService(deps.workers).authenticate(`Bearer ${provisioned.token}`),
    /机器令牌已撤销/,
  );
});

test('admin cannot revoke a credential through another worker identity', async () => {
  const deps = createInMemoryAdminDeps();
  const service = new AdminCrawlerService(deps);
  const first = await service.provisionWorker('first');
  const second = await service.provisionWorker('second');

  await assert.rejects(
    () => service.revokeWorkerCredential(first.worker.id, second.credentialId),
    /凭据不属于该 Worker/,
  );
  assert.equal(
    (await new WorkerAuthService(deps.workers).authenticate(`Bearer ${second.token}`)).worker.id,
    second.worker.id,
  );
});

test('worker repository controls claim, identity, and credential rotation', async () => {
  const deps = createInMemoryAdminDeps();
  const service = new AdminCrawlerService(deps);
  const provisioned = await service.provisionWorker('managed worker');

  assert.equal(provisioned.worker.claimEnabled, true);
  assert.equal((await deps.workers.setClaimEnabled(provisioned.worker.id, false)).claimEnabled, false);
  assert.equal((await deps.workers.setClaimEnabled(provisioned.worker.id, true)).claimEnabled, true);

  const replacement = 'replacement-token-with-enough-entropy';
  await deps.workers.rotateCredential(
    provisioned.worker.id,
    hashOpaqueToken(replacement),
    WORKER_SCOPES,
  );
  await assert.rejects(
    () => new WorkerAuthService(deps.workers).authenticate(`Bearer ${provisioned.token}`),
    /机器令牌无效/,
  );
  assert.equal(
    (await new WorkerAuthService(deps.workers).authenticate(`Bearer ${replacement}`)).worker.id,
    provisioned.worker.id,
  );

  assert.equal((await deps.workers.setEnabled(provisioned.worker.id, false)).isEnabled, false);
  await assert.rejects(
    () => new WorkerAuthService(deps.workers).authenticate(`Bearer ${replacement}`),
    /Worker 已禁用/,
  );
});

test('worker lifecycle repository rejects unknown ids', async () => {
  const { workers } = createInMemoryAdminDeps();
  await assert.rejects(() => workers.setClaimEnabled(999, false), /Worker 不存在/);
  await assert.rejects(() => workers.setEnabled(999, false), /Worker 不存在/);
  await assert.rejects(
    () => workers.rotateCredential(999, hashOpaqueToken('unknown-token'), WORKER_SCOPES),
    /Worker 不存在/,
  );
});

test('crawler worker schemas add claim_enabled without replacing worker history', () => {
  const migration = readFileSync(
    'drizzle/migrations/0017-crawler-worker-claim-control.sql',
    'utf8',
  );
  const core = readFileSync('drizzle/core/0001-crawler-core.sql', 'utf8');
  assert.match(
    migration,
    /ALTER TABLE `crawler_workers`\s+ADD COLUMN IF NOT EXISTS `claim_enabled` TINYINT(?:\(1\))? NOT NULL DEFAULT 1/i,
  );
  assert.doesNotMatch(migration, /DROP|DELETE|TRUNCATE/i);
  assert.match(core, /`claim_enabled` TINYINT(?:\(1\))? NOT NULL DEFAULT 1/i);
});
