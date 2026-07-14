import assert from 'node:assert/strict';
import test from 'node:test';
import { CrawlerJobService } from '../../lib/server/crawler/application/crawler-job-service';
import { CrawlerResultService } from '../../lib/server/crawler/application/crawler-result-service';
import { withOperationReceipt } from '../../lib/server/crawler/application/operation-receipts';
import {
  hashOpaqueToken,
  hashRequestBody,
  hashesEqual,
} from '../../lib/server/crawler/domain/hashing';
import { InMemoryCrawlerUnitOfWork } from '../../lib/server/crawler/testing/in-memory-crawler-uow';
import { AppError } from '../../lib/server/shared/errors';

async function runningJob() {
  const uow = new InMemoryCrawlerUnitOfWork();
  const jobs = new CrawlerJobService(uow);
  await jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });
  const claimed = await jobs.claimForWorker({ workerId: 1, now: new Date() });
  assert.ok(claimed);
  const binding = {
    jobId: claimed!.job.id,
    attemptId: claimed!.attempt.id,
    workerId: 1,
    leaseToken: claimed!.leaseToken,
  };
  await jobs.start(binding);
  return { uow, jobs, binding };
}

test('same idempotency key + same request hash replays receipt', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  let executions = 0;

  const first = await withOperationReceipt({
    receipts: uow.receipts,
    operationScope: 'test.op',
    idempotencyKey: 'key-1',
    jobId: 10,
    requestBody: { a: 1, b: 2 },
    execute: async () => {
      executions += 1;
      return { ok: true, value: 42 };
    },
  });
  assert.equal(first.replayed, false);
  assert.equal(first.body.value, 42);

  const second = await withOperationReceipt({
    receipts: uow.receipts,
    operationScope: 'test.op',
    idempotencyKey: 'key-1',
    jobId: 10,
    requestBody: { b: 2, a: 1 }, // key order independent
    execute: async () => {
      executions += 1;
      return { ok: true, value: 99 };
    },
  });
  assert.equal(second.replayed, true);
  assert.equal(second.body.value, 42);
  assert.equal(executions, 1);
});

test('same key + different request hash is RESULT_CONFLICT', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  await withOperationReceipt({
    receipts: uow.receipts,
    operationScope: 'test.op',
    idempotencyKey: 'key-2',
    jobId: 1,
    requestBody: { x: 1 },
    execute: async () => ({ ok: true }),
  });

  await assert.rejects(
    () =>
      withOperationReceipt({
        receipts: uow.receipts,
        operationScope: 'test.op',
        idempotencyKey: 'key-2',
        jobId: 1,
        requestBody: { x: 2 },
        execute: async () => ({ ok: false }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'RESULT_CONFLICT');
      return true;
    },
  );
});

test('same key + different job scope is RESULT_CONFLICT', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  await withOperationReceipt({
    receipts: uow.receipts,
    operationScope: 'test.op',
    idempotencyKey: 'key-3',
    jobId: 1,
    requestBody: { x: 1 },
    execute: async () => ({ ok: true }),
  });

  await assert.rejects(
    () =>
      withOperationReceipt({
        receipts: uow.receipts,
        operationScope: 'test.op',
        idempotencyKey: 'key-3',
        jobId: 2,
        requestBody: { x: 1 },
        execute: async () => ({ ok: true }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'RESULT_CONFLICT');
      return true;
    },
  );
});

test('item commit receipt: replay returns original item', async () => {
  const { uow, binding } = await runningJob();
  const results = new CrawlerResultService(uow);

  const first = await results.commitItem({
    ...binding,
    idempotencyKey: 'item-1',
    source: 'hanime',
    sourceId: 'abc',
    status: 'succeeded',
    animeId: 100,
  });
  assert.equal(first.replayed, false);
  assert.equal(first.item.animeId, 100);

  const second = await results.commitItem({
    ...binding,
    idempotencyKey: 'item-1',
    source: 'hanime',
    sourceId: 'abc',
    status: 'succeeded',
    animeId: 100,
  });
  assert.equal(second.replayed, true);
  assert.equal(second.item.id, first.item.id);
  assert.equal(second.item.animeId, 100);
});

test('item commit conflict on different payload', async () => {
  const { uow, binding } = await runningJob();
  const results = new CrawlerResultService(uow);

  await results.commitItem({
    ...binding,
    idempotencyKey: 'item-2',
    source: 'hanime',
    sourceId: 'x',
    status: 'succeeded',
  });

  await assert.rejects(
    () =>
      results.commitItem({
        ...binding,
        idempotencyKey: 'item-2',
        source: 'hanime',
        sourceId: 'x',
        status: 'failed',
        errorCode: 'PARSE',
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'RESULT_CONFLICT');
      return true;
    },
  );
});

test('complete and fail persist operation receipts', async () => {
  const { jobs, binding } = await runningJob();

  const first = await jobs.complete({
    ...binding,
    outcome: 'succeeded',
    idempotencyKey: 'done-1',
    succeededItems: 3,
    failedItems: 0,
    continueOnError: true,
  });
  assert.equal(first.job.status, 'succeeded');

  const replay = await jobs.complete({
    ...binding,
    outcome: 'succeeded',
    idempotencyKey: 'done-1',
    succeededItems: 3,
    failedItems: 0,
    continueOnError: true,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.job.status, 'succeeded');
});

test('fail receipt replays without re-executing transition', async () => {
  const { jobs, binding } = await runningJob();

  const first = await jobs.fail({
    ...binding,
    idempotencyKey: 'fail-1',
    retryable: false,
    errorCode: 'SOURCE_UNAVAILABLE',
  });
  assert.equal(first.job.status, 'failed');

  const replay = await jobs.fail({
    ...binding,
    idempotencyKey: 'fail-1',
    retryable: false,
    errorCode: 'SOURCE_UNAVAILABLE',
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.job.status, 'failed');
});

test('hash helpers: stable request hash and token digest length', () => {
  const a = hashRequestBody({ z: 1, a: 2 });
  const b = hashRequestBody({ a: 2, z: 1 });
  assert.equal(hashesEqual(a, b), true);
  assert.equal(a.byteLength, 32);

  const t = hashOpaqueToken('lease-token-value');
  assert.equal(t.byteLength, 32);
  assert.equal(hashesEqual(t, hashOpaqueToken('lease-token-value')), true);
  assert.equal(hashesEqual(t, hashOpaqueToken('other')), false);
});
