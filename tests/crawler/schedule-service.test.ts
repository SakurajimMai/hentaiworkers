import assert from 'node:assert/strict';
import test from 'node:test';
import { CrawlerScheduleService } from '../../lib/server/crawler/application/crawler-schedule-service';
import {
  canStartAdditionalJob,
  computeNextRunAt,
  countOverduePoints,
  isValidFiveFieldCron,
  isValidIanaTimezone,
  materializeMisfirePoints,
  nextFiveFieldCronUtc,
  shouldMaterializeOccurrence,
  validateScheduleDefinition,
} from '../../lib/server/crawler/domain/schedule';
import { InMemoryCrawlerUnitOfWork } from '../../lib/server/crawler/testing/in-memory-crawler-uow';
import { AppError } from '../../lib/server/shared/errors';

test('five-field cron validation rejects seconds field', () => {
  assert.equal(isValidFiveFieldCron('0 3 * * *'), true);
  assert.equal(isValidFiveFieldCron('*/5 * * * *'), true);
  assert.equal(isValidFiveFieldCron('0 3 * * * *'), false);
  assert.equal(isValidFiveFieldCron('bad'), false);
});

test('IANA timezone accepted; garbage rejected', () => {
  assert.equal(isValidIanaTimezone('Asia/Shanghai'), true);
  assert.equal(isValidIanaTimezone('UTC'), true);
  assert.equal(isValidIanaTimezone('America/New_York'), true);
  assert.equal(isValidIanaTimezone('Not/AZone'), false);
  assert.equal(isValidIanaTimezone(''), false);
});

test('misfire policies: skip / latest_only / catch_up cap 3', () => {
  assert.equal(materializeMisfirePoints({ policy: 'skip', overdueCount: 9 }), 0);
  assert.equal(materializeMisfirePoints({ policy: 'latest_only', overdueCount: 9 }), 1);
  assert.equal(
    materializeMisfirePoints({ policy: 'catch_up', overdueCount: 10, catchUpLimit: 3 }),
    3,
  );
  assert.equal(
    materializeMisfirePoints({ policy: 'catch_up', overdueCount: 2, catchUpLimit: 3 }),
    2,
  );
});

test('template concurrency cap blocks parallel start', () => {
  assert.equal(
    canStartAdditionalJob({ activeJobs: 1, maxActiveJobs: 1, overlapPolicy: 'parallel' }),
    false,
  );
  assert.equal(
    shouldMaterializeOccurrence({
      executingJobs: 1,
      nonTerminalJobs: 1,
      maxActiveJobs: 1,
      overlapPolicy: 'parallel',
    }),
    'skip_event',
  );
  assert.equal(
    shouldMaterializeOccurrence({
      executingJobs: 0,
      nonTerminalJobs: 1,
      maxActiveJobs: 1,
      overlapPolicy: 'skip',
    }),
    'skip_event',
  );
  assert.equal(
    shouldMaterializeOccurrence({
      executingJobs: 1,
      nonTerminalJobs: 1,
      maxActiveJobs: 2,
      overlapPolicy: 'queue',
    }),
    'create',
  );
});

test('overdue display works without Worker', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  const service = new CrawlerScheduleService(uow);
  const past = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  await service.create({
    profileId: 1,
    profileVersionId: 1,
    name: 'nightly',
    kind: 'interval',
    intervalSeconds: 3600,
    timezone: 'Asia/Shanghai',
    overlapPolicy: 'skip',
    misfirePolicy: 'latest_only',
    maxActiveJobs: 1,
    catchUpLimit: 3,
    configSnapshotJson: '{"schemaVersion":1}',
    nextRunAt: past,
  });

  const overdue = await service.listOverdue(new Date());
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].status, 'overdue_awaiting_claim');
  assert.equal(overdue[0].overduePoints, 1);
  assert.ok(overdue[0].nextRunAt <= new Date().toISOString());
});

test('disableByProfileId disables only matching enabled schedules idempotently', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  const service = new CrawlerScheduleService(uow);
  const input = {
    profileVersionId: 1,
    name: 'hourly',
    kind: 'interval' as const,
    intervalSeconds: 3600,
    timezone: 'UTC',
    overlapPolicy: 'skip' as const,
    misfirePolicy: 'latest_only' as const,
    maxActiveJobs: 1,
    catchUpLimit: 3,
    configSnapshotJson: '{}',
  };
  await service.create({ ...input, profileId: 7 });
  await service.create({ ...input, profileId: 7, name: 'disabled', isEnabled: false });
  await service.create({ ...input, profileId: 8, name: 'other' });

  assert.equal(await service.disableByProfileId(7), 1);
  assert.equal(await service.disableByProfileId(7), 0);
  assert.deepEqual(
    (await uow.schedules.listEnabled()).map((schedule) => schedule.profileId),
    [8],
  );
});

test('disableByProfileId rejects invalid profile IDs before opening a transaction', async () => {
  let transactionCalled = false;
  const service = new CrawlerScheduleService({
    async runInTransaction<T>(): Promise<T> {
      transactionCalled = true;
      throw new Error('不应开启事务');
    },
  });

  for (const profileId of [0, -1, 1.5, Number.NaN]) {
    await assert.rejects(
      () => service.disableByProfileId(profileId),
      (error: unknown) => error instanceof AppError && error.status === 400,
    );
  }
  assert.equal(transactionCalled, false);
});

test('catch_up materializes up to 3 interval points and advances next_run_at', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  const service = new CrawlerScheduleService(uow);
  const now = new Date('2026-07-13T12:00:00.000Z');
  const first = new Date('2026-07-13T08:00:00.000Z');

  const schedule = await service.create({
    profileId: 7,
    profileVersionId: 1,
    storageProfileVersionId: 19,
    name: 'hourly',
    kind: 'interval',
    intervalSeconds: 3600,
    timezone: 'UTC',
    overlapPolicy: 'queue',
    misfirePolicy: 'catch_up',
    maxActiveJobs: 4,
    catchUpLimit: 3,
    configSnapshotJson: '{}',
    nextRunAt: first.toISOString(),
  });

  const result = await uow.runInTransaction((repos) =>
    service.materializeDueSchedules(repos, now),
  );

  assert.equal(result.created.length, 3);
  assert.equal(result.skipped.length, 0);
  assert.deepEqual(
    result.created.map((job) => job.storageProfileVersionId),
    [19, 19, 19],
  );
  // unique schedule points
  const keys = new Set(result.created.map((j) => `${j.scheduleId}|${j.scheduledFor}`));
  assert.equal(keys.size, 3);

  const updated = await uow.schedules.get(schedule.id);
  assert.ok(updated?.nextRunAt);
  assert.ok(updated!.nextRunAt! > now.toISOString() || updated!.lastMaterializedAt != null);
});

test('skip overlap records skipped event instead of job', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  const service = new CrawlerScheduleService(uow);
  const now = new Date();
  const past = new Date(now.getTime() - 60_000).toISOString();

  await service.create({
    profileId: 3,
    profileVersionId: 1,
    name: 'skippy',
    kind: 'interval',
    intervalSeconds: 120,
    timezone: 'UTC',
    overlapPolicy: 'skip',
    misfirePolicy: 'latest_only',
    maxActiveJobs: 1,
    catchUpLimit: 3,
    configSnapshotJson: '{}',
    nextRunAt: past,
  });

  // existing non-terminal job for profile
  await uow.jobs.create({
    kind: 'crawl',
    profileId: 3,
    profileVersionId: 1,
    configSnapshotJson: '{}',
  });

  const result = await uow.runInTransaction((repos) =>
    service.materializeDueSchedules(repos, now),
  );
  assert.equal(result.created.length, 0);
  assert.equal(result.skipped.length, 1);
});

test('queued storage_test with the same numeric id does not consume crawl overlap capacity', async () => {
  const uow = new InMemoryCrawlerUnitOfWork();
  const service = new CrawlerScheduleService(uow);
  const now = new Date();
  const past = new Date(now.getTime() - 60_000).toISOString();

  await service.create({
    profileId: 3,
    profileVersionId: 1,
    name: 'crawl-after-storage-test',
    kind: 'interval',
    intervalSeconds: 120,
    timezone: 'UTC',
    overlapPolicy: 'skip',
    misfirePolicy: 'latest_only',
    maxActiveJobs: 1,
    catchUpLimit: 3,
    configSnapshotJson: '{}',
    nextRunAt: past,
  });
  await uow.jobs.create({
    kind: 'storage_test',
    profileId: 3,
    profileVersionId: 0,
    storageProfileVersionId: 3,
    configSnapshotJson: '{"kind":"storage_test"}',
  });

  const result = await uow.runInTransaction((repos) =>
    service.materializeDueSchedules(repos, now),
  );

  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].kind, 'crawl');
  assert.equal(result.skipped.length, 0);
});

test('invalid schedule definition is rejected', async () => {
  const service = new CrawlerScheduleService(new InMemoryCrawlerUnitOfWork());
  await assert.rejects(
    () =>
      service.create({
        profileId: 1,
        profileVersionId: 1,
        name: 'bad',
        kind: 'cron',
        cron: 'not-cron',
        timezone: 'Asia/Shanghai',
        overlapPolicy: 'skip',
        misfirePolicy: 'latest_only',
        maxActiveJobs: 1,
        catchUpLimit: 3,
        configSnapshotJson: '{}',
      }),
    AppError,
  );

  const errors = validateScheduleDefinition({
    kind: 'interval',
    intervalSeconds: 10,
    timezone: 'UTC',
    overlapPolicy: 'parallel',
    misfirePolicy: 'skip',
    maxActiveJobs: 1,
    catchUpLimit: 3,
  });
  assert.ok(errors.length >= 2);
});

test('next cron fire is strictly after from (DST-safe single UTC point)', () => {
  const from = new Date('2026-03-08T00:00:00.000Z');
  const next = nextFiveFieldCronUtc('0 3 * * *', 'UTC', from);
  assert.ok(next);
  assert.ok(next!.getTime() > from.getTime());
  assert.equal(next!.getUTCHours(), 3);
  assert.equal(next!.getUTCMinutes(), 0);

  // computeNextRunAt for interval
  const intervalNext = computeNextRunAt({
    kind: 'interval',
    intervalSeconds: 120,
    timezone: 'UTC',
    from,
  });
  assert.equal(intervalNext?.getTime(), from.getTime() + 120_000);
});

test('countOverduePoints respects catch_up cap', () => {
  const nextRunAt = new Date('2026-07-13T00:00:00.000Z');
  const now = new Date('2026-07-13T10:00:00.000Z');
  assert.equal(
    countOverduePoints({
      nextRunAt,
      now,
      kind: 'interval',
      intervalSeconds: 3600,
      misfirePolicy: 'catch_up',
      catchUpLimit: 3,
    }),
    3,
  );
  assert.equal(
    countOverduePoints({
      nextRunAt,
      now,
      kind: 'interval',
      intervalSeconds: 3600,
      misfirePolicy: 'latest_only',
      catchUpLimit: 3,
    }),
    1,
  );
});
