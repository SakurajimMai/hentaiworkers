import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminCrawlerService } from '../../lib/server/crawler/application/admin-crawler-service';
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
});

test('admin revokes a worker credential', async () => {
  const deps = createInMemoryAdminDeps();
  const service = new AdminCrawlerService(deps);
  const provisioned = await service.provisionWorker('revoked worker');

  await service.revokeWorkerCredential(provisioned.credentialId);

  await assert.rejects(
    () => new WorkerAuthService(deps.workers).authenticate(`Bearer ${provisioned.token}`),
    /机器令牌已撤销/,
  );
});
