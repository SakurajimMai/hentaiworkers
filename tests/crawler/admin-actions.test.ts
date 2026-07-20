import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminActivateStorage,
  adminCancelJob,
  adminConfirmYamlImport,
  adminCreateProfile,
  adminCreateSecret,
  adminCreateStorageDraft,
  adminDeleteProfile,
  adminDeleteJob,
  adminPurgeTerminalJobs,
  adminMarkStorageTestPassed,
  adminRevealSecret,
  adminRotateWorkerCredential,
  adminSetWorkerClaimEnabled,
  adminSetWorkerEnabled,
  adminRetryJob,
  adminSaveSchedule,
  adminStartManualJob,
  adminStartProfileJob,
  adminStartStorageTest,
  adminUpdateProfile,
  type AdminActionContext,
} from '../../lib/server/crawler/interfaces/admin-crawler-actions';
import {
  createAdminCrawlerService,
  createInMemoryAdminDeps,
} from '../../lib/server/crawler/interfaces/admin-crawler-deps';
import { AppError } from '../../lib/server/shared/errors';

function makeCtxFromCrawler(
  crawler: ReturnType<typeof createAdminCrawlerService>,
  isAdmin = true,
): AdminActionContext {
  return {
    identity: {
      async requireAdmin() {
        if (!isAdmin) {
          throw new AppError('AUTH_REQUIRED', '需要管理员', 403);
        }
        return {
          id: 1,
          username: 'admin',
          role: 'admin' as const,
          displayName: 'Admin',
          isActive: 1,
          passwordHash: 'x',
          sessionVersion: 1,
        };
      },
    },
    crawler,
  };
}

function makeCtx(isAdmin = true): AdminActionContext {
  return makeCtxFromCrawler(createAdminCrawlerService(createInMemoryAdminDeps()), isAdmin);
}

const validProfile = {
  schemaVersion: 1 as const,
  source: { baseUrl: 'https://example.com' },
  dateFilter: { years: [2026], months: [1] },
  qualityPriority: ['1080'],
  skipKeywords: [],
  concurrency: { download: 2, parse: 2 },
  continueOnError: true,
  maxActiveJobs: 1,
};

test('admin actions require authorization', async () => {
  const ctx = makeCtx(false);
  await assert.rejects(
    () =>
      adminCreateProfile(ctx, {
        name: 'p',
        configJson: JSON.stringify(validProfile),
      }),
    (e: unknown) => e instanceof AppError && e.status === 403,
  );
  await assert.rejects(
    () => adminUpdateProfile(ctx, {
      profileId: 1,
      name: 'updated',
      configJson: JSON.stringify(validProfile),
    }),
    (e: unknown) => e instanceof AppError && e.status === 403,
  );
  await assert.rejects(
    () => adminDeleteProfile(ctx, 1),
    (e: unknown) => e instanceof AppError && e.status === 403,
  );
});

test('admin worker actions pause, resume, rotate, and hard-disable an existing node', async () => {
  const deps = createInMemoryAdminDeps();
  const crawler = createAdminCrawlerService(deps);
  const ctx = makeCtxFromCrawler(crawler);
  const provisioned = await crawler.provisionWorker('admin-managed');

  assert.equal(
    (await adminSetWorkerClaimEnabled(ctx, provisioned.worker.id, false)).claimEnabled,
    false,
  );
  assert.equal(
    (await adminSetWorkerClaimEnabled(ctx, provisioned.worker.id, true)).claimEnabled,
    true,
  );

  const rotated = await adminRotateWorkerCredential(ctx, provisioned.worker.id);
  assert.ok(rotated.token.length >= 32);
  assert.notEqual(rotated.token, provisioned.token);

  assert.equal(
    (await adminSetWorkerEnabled(ctx, provisioned.worker.id, false)).isEnabled,
    false,
  );
  assert.equal(
    (await adminSetWorkerEnabled(ctx, provisioned.worker.id, true)).isEnabled,
    true,
  );

  for (const invalidId of [0, -1, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      () => adminSetWorkerClaimEnabled(ctx, invalidId, false),
      (error: unknown) => error instanceof AppError && error.status === 400,
    );
  }
  await assert.rejects(
    () => adminSetWorkerEnabled(ctx, 999, false),
    (error: unknown) => error instanceof AppError && error.status === 404,
  );
});

test('create profile validates JSON and Zod config', async () => {
  const ctx = makeCtx();
  const version = await adminCreateProfile(ctx, {
    name: 'default',
    configJson: JSON.stringify(validProfile),
  });
  assert.equal(version.version, 1);

  await assert.rejects(
    () => adminCreateProfile(ctx, { name: 'bad', configJson: '{not json' }),
    (error: unknown) =>
      error instanceof AppError
      && error.status === 400
      && error.message === '配置 JSON 无效',
  );
});

test('manual crawl start ignores forged job fields and uses the canonical profile snapshot', async () => {
  const ctx = makeCtx();
  const version = await adminCreateProfile(ctx, {
    name: 'manual',
    configJson: JSON.stringify(validProfile),
  });
  const job = await adminStartManualJob(ctx, {
    profileVersionId: version.id,
    profileId: 999,
    kind: 'storage_test',
    storageProfileVersionId: 999,
    configSnapshotJson: '{"forged":true}',
  } as Parameters<typeof adminStartManualJob>[1]);
  assert.equal(job.status, 'queued');
  assert.equal(job.kind, 'crawl');
  assert.equal(job.profileId, version.profileId);
  assert.equal(job.profileVersionId, version.id);
  assert.equal(job.storageProfileVersionId, null);
  assert.deepEqual(JSON.parse(job.configSnapshotJson), version.config);

  const cancelled = await adminCancelJob(ctx, job.id);
  assert.equal(cancelled.status, 'cancelled');

  const retry = await adminRetryJob(ctx, job.id);
  assert.equal(retry.retryOfJobId, job.id);
  assert.equal(retry.status, 'queued');
});

test('profile update action parses JSON and updates metadata', async () => {
  const ctx = makeCtx();
  const v1 = await adminCreateProfile(ctx, {
    name: 'old',
    configJson: JSON.stringify(validProfile),
  });
  const v2 = await adminUpdateProfile(ctx, {
    profileId: v1.profileId,
    name: '  updated  ',
    configJson: JSON.stringify({
      ...validProfile,
      concurrency: { download: 4, parse: 3 },
    }),
  });

  assert.equal(v2.version, 2);
  assert.equal(v2.config.concurrency.download, 4);
  assert.equal((await ctx.crawler.getProfile(v1.profileId))?.name, 'updated');
  await assert.rejects(
    () => adminUpdateProfile(ctx, {
      profileId: v1.profileId,
      name: 'bad-json',
      configJson: '{not json',
    }),
    (error: unknown) =>
      error instanceof AppError
      && error.status === 400
      && error.message === '配置 JSON 无效',
  );
});

test('crawl retry is rejected after its profile is disabled', async () => {
  const deps = createInMemoryAdminDeps();
  const crawler = createAdminCrawlerService(deps);
  const ctx = makeCtxFromCrawler(crawler);
  const version = await adminCreateProfile(ctx, {
    name: 'retry-delete',
    configJson: JSON.stringify(validProfile),
  });
  const job = await adminStartProfileJob(ctx, version.id);
  await adminCancelJob(ctx, job.id);
  await adminDeleteProfile(ctx, version.profileId);

  await assert.rejects(
    () => adminRetryJob(ctx, job.id),
    (error: unknown) =>
      error instanceof AppError
      && error.code === 'RESULT_INVALID'
      && error.status === 404,
  );
});

test('job actions reject invalid IDs before calling crawler service', async () => {
  const ctx = makeCtx();
  let called = false;
  ctx.crawler.deleteJob = async () => {
    called = true;
  };

  await assert.rejects(
    () => adminDeleteJob(ctx, Number.NaN),
    (error: unknown) => error instanceof AppError && error.status === 400,
  );
  await assert.rejects(
    () => adminDeleteJob(ctx, 0),
    (error: unknown) => error instanceof AppError && error.status === 400,
  );
  assert.equal(called, false);
});

test('purge action maps valid scopes and rejects unknown scope', async () => {
  const ctx = makeCtx();
  const calls: Array<ReadonlyArray<string> | undefined> = [];
  ctx.crawler.purgeTerminalJobs = async (input) => {
    calls.push(input.statuses);
    return { deleted: 0, truncated: false };
  };

  await adminPurgeTerminalJobs(ctx, { olderThanDays: 30, scope: 'all' });
  await adminPurgeTerminalJobs(ctx, { olderThanDays: 30, scope: 'success' });
  await adminPurgeTerminalJobs(ctx, { olderThanDays: 30, scope: 'failed' });
  await adminPurgeTerminalJobs(ctx, { olderThanDays: 30, scope: 'cancelled' });
  assert.deepEqual(calls, [
    ['succeeded', 'partial_succeeded', 'failed', 'cancelled'],
    ['succeeded', 'partial_succeeded'],
    ['failed'],
    ['cancelled'],
  ]);

  await assert.rejects(
    () => adminPurgeTerminalJobs(ctx, { olderThanDays: 30, scope: 'typo' }),
    (error: unknown) =>
      error instanceof AppError
      && error.status === 400
      && error.message === '无效清理范围',
  );
  assert.equal(calls.length, 4);
});

test('schedule save validates definition', async () => {
  const ctx = makeCtx();
  const version = await adminCreateProfile(ctx, {
    name: 'scheduled',
    configJson: JSON.stringify(validProfile),
  });
  const schedule = await adminSaveSchedule(ctx, {
    profileId: version.profileId,
    profileVersionId: version.id,
    name: 'hourly',
    kind: 'interval',
    intervalSeconds: 3600,
    timezone: 'Asia/Shanghai',
    overlapPolicy: 'skip',
    misfirePolicy: 'latest_only',
    maxActiveJobs: 1,
    catchUpLimit: 3,
  });
  assert.ok(schedule.id > 0);

  await assert.rejects(
    () =>
      adminSaveSchedule(ctx, {
        profileId: version.profileId,
        profileVersionId: version.id,
        name: 'bad',
        kind: 'cron',
        cron: 'invalid',
        timezone: 'Asia/Shanghai',
        overlapPolicy: 'skip',
        misfirePolicy: 'latest_only',
        maxActiveJobs: 1,
        catchUpLimit: 3,
      }),
    AppError,
  );
});

test('claim does not materialize a stale enabled schedule for a disabled profile', async () => {
  const deps = createInMemoryAdminDeps();
  const crawler = createAdminCrawlerService(deps);
  const ctx = makeCtxFromCrawler(crawler);
  const worker = await crawler.provisionWorker('schedule-test-worker');
  const version = await adminCreateProfile(ctx, {
    name: 'stale-schedule',
    configJson: JSON.stringify(validProfile),
  });
  const schedule = await adminSaveSchedule(ctx, {
    profileVersionId: version.id,
    name: 'stale',
    kind: 'interval',
    intervalSeconds: 3600,
    timezone: 'UTC',
    overlapPolicy: 'queue',
    misfirePolicy: 'latest_only',
    maxActiveJobs: 1,
    catchUpLimit: 3,
    nextRunAt: new Date(Date.now() - 3_600_000).toISOString(),
  });
  await deps.profiles.disableProfile(version.profileId);

  assert.equal(
    await deps.jobs.claimForWorker({ workerId: worker.worker.id, now: new Date() }),
    null,
  );
  assert.equal(
    (await deps.uow.runInTransaction((repos) => repos.schedules.get(schedule.id)))?.isEnabled,
    false,
  );
});

test('soft deleting a profile disables schedules and rejects every new crawl path', async () => {
  const deps = createInMemoryAdminDeps();
  const crawler = createAdminCrawlerService(deps);
  const ctx = makeCtxFromCrawler(crawler);
  const v1 = await adminCreateProfile(ctx, {
    name: 'to-delete',
    configJson: JSON.stringify(validProfile),
  });
  const historicalJob = await adminStartManualJob(ctx, {
    profileVersionId: v1.id,
  });
  await adminCancelJob(ctx, historicalJob.id);
  const v2 = await adminUpdateProfile(ctx, {
    profileId: v1.profileId,
    name: 'to-delete-v2',
    configJson: JSON.stringify({
      ...validProfile,
      concurrency: { download: 3, parse: 2 },
    }),
  });
  const historicalSchedule = await adminSaveSchedule(ctx, {
    profileId: v2.profileId,
    profileVersionId: v2.id,
    name: 'hourly',
    kind: 'interval',
    intervalSeconds: 3600,
    timezone: 'Asia/Shanghai',
    overlapPolicy: 'skip',
    misfirePolicy: 'latest_only',
    maxActiveJobs: 1,
    catchUpLimit: 3,
  });

  await adminDeleteProfile(ctx, v2.profileId);
  await adminDeleteProfile(ctx, v2.profileId);
  await assert.rejects(
    () => adminDeleteProfile(ctx, 999),
    (error: unknown) =>
      error instanceof AppError
      && error.code === 'RESULT_INVALID'
      && error.status === 404,
  );

  assert.equal((await deps.uow.runInTransaction((repos) => repos.schedules.listEnabled())).length, 0);
  const disabled = await crawler.getProfile(v2.profileId);
  assert.ok(disabled);
  assert.equal(disabled.isEnabled, false);
  assert.equal(
    JSON.parse((await crawler.getJob(historicalJob.id))!.configSnapshotJson).concurrency.download,
    2,
  );
  assert.equal(
    JSON.parse((await deps.uow.runInTransaction((repos) =>
      repos.schedules.get(historicalSchedule.id)))!.configSnapshotJson).concurrency.download,
    3,
  );

  const assertDeletedProfile = (error: unknown) =>
    error instanceof AppError
    && error.code === 'RESULT_INVALID'
    && error.status === 404;
  await assert.rejects(() => adminStartProfileJob(ctx, v2.id), assertDeletedProfile);
  await assert.rejects(
    () => adminStartManualJob(ctx, { profileVersionId: v2.id }),
    assertDeletedProfile,
  );
  await assert.rejects(() => adminRetryJob(ctx, historicalJob.id), assertDeletedProfile);
  await assert.rejects(
    () => adminSaveSchedule(ctx, {
      profileId: v2.profileId,
      profileVersionId: v2.id,
      name: 'forged',
      kind: 'interval',
      intervalSeconds: 3600,
      timezone: 'Asia/Shanghai',
      overlapPolicy: 'skip',
      misfirePolicy: 'latest_only',
      maxActiveJobs: 1,
      catchUpLimit: 3,
    }),
    assertDeletedProfile,
  );
});

test('secret create and direct-eye reveal without re-auth', async () => {
  const ctx = makeCtx();
  const meta = await adminCreateSecret(ctx, {
    name: 'proxy',
    scope: 'network.proxy',
    plaintext: 'secret-value-xyz',
  });
  const revealed = await adminRevealSecret(ctx, meta.id);
  assert.equal(revealed.plaintext, 'secret-value-xyz');
  assert.equal(revealed.cacheControl, 'no-store');
});

test('YAML import confirmation creates profile', async () => {
  const ctx = makeCtx();
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
  const result = await adminConfirmYamlImport(ctx, {
    name: 'from-yaml',
    rawYaml: yaml,
    nodeEnv: 'development',
  });
  assert.ok(result.version.id > 0);
  assert.equal(result.preview.invalid.length, 0);
});

test('storage test job and activate gate', async () => {
  const ctx = makeCtx();
  const draft = await adminCreateStorageDraft(ctx, {
    name: 's3',
    configJson: JSON.stringify({
      driver: 's3',
      endpoint: 'https://s3.example.com',
      region: 'auto',
      bucket: 'b',
      prefix: '',
      publicBaseUrl: 'https://cdn.example.com',
    }),
  });

  await assert.rejects(() => adminActivateStorage(ctx, draft.id), AppError);

  const testJob = await adminStartStorageTest(ctx, {
    storageProfileVersionId: draft.id,
  });
  assert.equal(testJob.kind, 'storage_test');
  assert.equal(testJob.profileId, null);
  await adminCancelJob(ctx, testJob.id);
  const retry = await adminRetryJob(ctx, testJob.id);
  assert.equal(retry.kind, 'storage_test');
  assert.equal(retry.retryOfJobId, testJob.id);

  await assert.rejects(() => adminMarkStorageTestPassed(ctx, draft.id), AppError);
  await adminMarkStorageTestPassed(ctx, draft.id, { allowBreakGlass: true });
  await adminActivateStorage(ctx, draft.id);
});

test('storage config JSON errors keep their exact admin message', async () => {
  const ctx = makeCtx();
  await assert.rejects(
    () => adminCreateStorageDraft(ctx, { name: 'bad', configJson: '{not json' }),
    (error: unknown) =>
      error instanceof AppError
      && error.status === 400
      && error.message === '存储配置 JSON 无效',
  );
});

test('Hanime profile start binds activated storage version', async () => {
  const deps = createInMemoryAdminDeps();
  const crawler = createAdminCrawlerService(deps);
  const ctx: AdminActionContext = {
    identity: {
      async requireAdmin() {
        return {
          id: 1,
          username: 'admin',
          role: 'admin' as const,
          displayName: 'Admin',
          isActive: 1,
          passwordHash: 'x',
          sessionVersion: 1,
        };
      },
    },
    crawler,
  };

  const profile = await adminCreateProfile(ctx, {
    name: 'hanime-s3',
    configJson: JSON.stringify({
      ...validProfile,
      requiredSource: 'hanime',
      storageDriver: 's3',
    }),
  });

  await assert.rejects(
    () => crawler.startProfileJob(profile.id),
    (err: unknown) =>
      err instanceof AppError && /S3 存储/.test(err.message),
  );

  const draft = await adminCreateStorageDraft(ctx, {
    name: 'hanime-bucket',
    configJson: JSON.stringify({
      driver: 's3',
      endpoint: 'https://s3.example.com',
      region: 'auto',
      bucket: 'hanime',
      prefix: 'h/',
      publicBaseUrl: 'https://cdn.example.com',
    }),
  });
  await adminMarkStorageTestPassed(ctx, draft.id, { allowBreakGlass: true });
  await adminActivateStorage(ctx, draft.id);

  const job = await crawler.startProfileJob(profile.id);
  assert.equal(job.storageProfileVersionId, draft.id);
  assert.equal(job.kind, 'crawl');
});
