import assert from 'node:assert/strict';
import test from 'node:test';
import { CrawlerJobService } from '../../lib/server/crawler/application/crawler-job-service';
import { CrawlerScheduleService } from '../../lib/server/crawler/application/crawler-schedule-service';
import { MediaReservationService } from '../../lib/server/crawler/application/media-reservation-service';
import { CrawlerLogService } from '../../lib/server/crawler/application/crawler-log-service';
import { buildMediaObjectKeys } from '../../lib/server/crawler/domain/media-paths';
import { InMemoryCrawlerUnitOfWork } from '../../lib/server/crawler/testing/in-memory-crawler-uow';
import { AppError } from '../../lib/server/shared/errors';

async function seedClaimed(workerId = 1) {
  const uow = new InMemoryCrawlerUnitOfWork();
  const jobs = new CrawlerJobService(uow, 60_000);
  const job = await jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 2,
    configSnapshotJson: '{"schemaVersion":1}',
    maxAttempts: 3,
  });
  const claimed = await jobs.claimForWorker({ workerId, now: new Date() });
  assert.ok(claimed);
  assert.equal(claimed!.job.id, job.id);
  assert.equal(claimed!.job.status, 'leased');
  assert.equal(claimed!.attempt.workerId, workerId);
  assert.equal(claimed!.attempt.leaseTokenHash.byteLength, 32);
  return { uow, jobs, claimed: claimed!, workerId };
}

test('concurrent claims: only one worker wins a single job', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  const jobs = new CrawlerJobService(uow);
  await jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });

  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      jobs.claimForWorker({ workerId: i + 1, now: new Date() }),
    ),
  );

  const wins = results.filter((r) => r != null);
  assert.equal(wins.length, 1);
  assert.equal(wins[0]!.job.status, 'leased');
  assert.equal(wins[0]!.attempt.attemptNo, 1);
});

test('claim creates attempt with hashed lease binding', async () => {
  const { claimed, uow } = await seedClaimed(9);
  const stored = await uow.jobs.getAttempt(claimed.attempt.id);
  assert.ok(stored);
  // plaintext token must not equal stored hash bytes as utf8
  assert.notEqual(
    Buffer.from(stored!.leaseTokenHash).toString('utf8'),
    claimed.leaseToken,
  );
  assert.equal(stored!.workerId, 9);
});

test('start / heartbeat / complete happy path', async () => {
  const { jobs, claimed, workerId } = await seedClaimed();
  const binding = {
    jobId: claimed.job.id,
    attemptId: claimed.attempt.id,
    workerId,
    leaseToken: claimed.leaseToken,
  };

  const running = await jobs.start(binding);
  assert.equal(running.status, 'running');

  const beat = await jobs.heartbeat({ ...binding, leaseTtlMs: 120_000 });
  assert.equal(beat.cancelRequested, false);
  assert.ok(beat.leaseExpiresAt > new Date().toISOString());

  const done = await jobs.complete({
    ...binding,
    outcome: 'succeeded',
    idempotencyKey: 'complete-1',
  });
  assert.equal(done.job.status, 'succeeded');
  assert.equal(done.replayed, false);
});

test('late submission after lease expiry is LEASE_LOST', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  const jobs = new CrawlerJobService(uow, 1_000);
  await jobs.enqueueManual({
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });

  const t0 = new Date('2026-07-13T10:00:00.000Z');
  const claimed = await jobs.claimForWorker({
    workerId: 1,
    now: t0,
    leaseTtlMs: 1_000,
  });
  assert.ok(claimed);

  const expired = new Date(t0.getTime() + 5_000);
  const n = await jobs.expireStaleLeases(expired);
  assert.equal(n, 1);

  await assert.rejects(
    () =>
      jobs.start({
        jobId: claimed!.job.id,
        attemptId: claimed!.attempt.id,
        workerId: 1,
        leaseToken: claimed!.leaseToken,
        now: expired,
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'LEASE_LOST');
      return true;
    },
  );
});

test('cancel on running becomes cancel_requested; complete then conflicts', async () => {
  const { jobs, claimed, workerId } = await seedClaimed();
  const binding = {
    jobId: claimed.job.id,
    attemptId: claimed.attempt.id,
    workerId,
    leaseToken: claimed.leaseToken,
  };
  await jobs.start(binding);
  const cancelled = await jobs.cancel(claimed.job.id);
  assert.equal(cancelled.status, 'cancel_requested');

  const beat = await jobs.heartbeat(binding);
  assert.equal(beat.cancelRequested, true);

  await assert.rejects(
    () =>
      jobs.complete({
        ...binding,
        outcome: 'succeeded',
        idempotencyKey: 'c1',
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.ok(error.code === 'CANCELLED' || error.code === 'RESULT_CONFLICT');
      return true;
    },
  );
});

test('claim materializes overdue schedule without Worker pre-presence', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  const schedules = new CrawlerScheduleService(uow);
  const jobs = new CrawlerJobService(uow);
  const past = new Date(Date.now() - 3_600_000).toISOString();

  await schedules.create({
    profileId: 5,
    profileVersionId: 1,
    name: 'auto',
    kind: 'interval',
    intervalSeconds: 3600,
    timezone: 'UTC',
    overlapPolicy: 'queue',
    misfirePolicy: 'latest_only',
    maxActiveJobs: 1,
    catchUpLimit: 3,
    configSnapshotJson: '{"from":"schedule"}',
    nextRunAt: past,
  });

  const claimed = await jobs.claimForWorker({ workerId: 2, now: new Date() });
  assert.ok(claimed);
  assert.equal(claimed!.job.scheduleId, 1);
  assert.equal(claimed!.job.status, 'leased');
  assert.ok(claimed!.job.configSnapshotJson.includes('schedule'));
});

test('duplicate schedule occurrence is rejected by unique key', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  const when = '2026-07-13T01:00:00.000Z';
  await uow.jobs.create({
    kind: 'crawl',
    profileId: 1,
    profileVersionId: 1,
    scheduleId: 9,
    scheduledFor: when,
    configSnapshotJson: '{}',
  });
  await assert.rejects(
    () =>
      uow.jobs.create({
        kind: 'crawl',
        profileId: 1,
        profileVersionId: 1,
        scheduleId: 9,
        scheduledFor: when,
        configSnapshotJson: '{}',
      }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'RESULT_CONFLICT');
      return true;
    },
  );
});

test('media reserve uses deterministic staging/final keys', async () => {
  const { jobs, claimed, workerId, uow } = await seedClaimed();
  await jobs.start({
    jobId: claimed.job.id,
    attemptId: claimed.attempt.id,
    workerId,
    leaseToken: claimed.leaseToken,
  });

  const media = new MediaReservationService(uow);
  const reserved = await media.reserve({
    jobId: claimed.job.id,
    attemptId: claimed.attempt.id,
    workerId,
    leaseToken: claimed.leaseToken,
    itemKey: 'hanime-123',
    prefix: 'anime/',
    assetKind: 'video',
    organizeByDate: true,
    now: new Date('2026-07-13T00:00:00.000Z'),
  });

  const expected = buildMediaObjectKeys({
    prefix: 'anime/',
    jobId: claimed.job.id,
    attemptId: claimed.attempt.id,
    itemKey: 'hanime-123',
    assetKind: 'video',
    organizeByDate: true,
    now: new Date('2026-07-13T00:00:00.000Z'),
  });
  assert.equal(reserved.stagingKey, expected.stagingKey);
  assert.equal(reserved.finalKey, expected.finalKey);
  assert.equal(reserved.status, 'reserved');

  const expired = await media.listExpiredReservations(
    new Date('2026-07-14T00:00:00.000Z'),
  );
  assert.equal(expired.length, 1);
});

test('log batch enforces 100 events / 256 KiB limits', async () => {
  const { claimed, workerId, uow } = await seedClaimed();
  const logs = new CrawlerLogService(uow);
  const binding = {
    jobId: claimed.job.id,
    attemptId: claimed.attempt.id,
    workerId,
    leaseToken: claimed.leaseToken,
  };

  await assert.rejects(
    () =>
      logs.appendBatch(
        binding,
        Array.from({ length: 101 }, (_, i) => ({
          sequence: i,
          eventType: 'log',
          message: 'x',
        })),
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'BATCH_TOO_LARGE');
      return true;
    },
  );

  const ok = await logs.appendBatch(binding, [
    { sequence: 1, eventType: 'progress', message: 'start' },
    { sequence: 2, eventType: 'progress', message: 'mid' },
  ]);
  assert.equal(ok.accepted, 2);

  // duplicate sequence soft-accepted (0 new)
  const replay = await logs.appendBatch(binding, [
    { sequence: 1, eventType: 'progress', message: 'start' },
  ]);
  assert.equal(replay.accepted, 0);
});

test('manual retry creates linked job from terminal status', async () => {
  const { jobs, claimed, workerId } = await seedClaimed();
  const binding = {
    jobId: claimed.job.id,
    attemptId: claimed.attempt.id,
    workerId,
    leaseToken: claimed.leaseToken,
  };
  await jobs.start(binding);
  await jobs.complete({
    ...binding,
    outcome: 'failed',
    idempotencyKey: 'fail-done',
  });

  const retry = await jobs.manualRetry(claimed.job.id);
  assert.equal(retry.retryOfJobId, claimed.job.id);
  assert.equal(retry.status, 'queued');
  assert.notEqual(retry.id, claimed.job.id);
});
