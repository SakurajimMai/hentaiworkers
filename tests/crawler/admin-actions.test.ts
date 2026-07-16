import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminActivateStorage,
  adminCancelJob,
  adminConfirmYamlImport,
  adminCreateProfile,
  adminCreateSecret,
  adminCreateStorageDraft,
  adminDeleteJob,
  adminPurgeTerminalJobs,
  adminMarkStorageTestPassed,
  adminRevealSecret,
  adminRetryJob,
  adminSaveSchedule,
  adminStartManualJob,
  adminStartStorageTest,
  type AdminActionContext,
} from '../../lib/server/crawler/interfaces/admin-crawler-actions';
import {
  createAdminCrawlerService,
  createInMemoryAdminDeps,
} from '../../lib/server/crawler/interfaces/admin-crawler-deps';
import { AppError } from '../../lib/server/shared/errors';

function makeCtx(isAdmin = true): AdminActionContext {
  const deps = createInMemoryAdminDeps();
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
    crawler: createAdminCrawlerService(deps),
  };
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
    AppError,
  );
});

test('manual start, cancel, retry job lifecycle', async () => {
  const ctx = makeCtx();
  const job = await adminStartManualJob(ctx, {
    profileId: 1,
    profileVersionId: 1,
    configSnapshotJson: JSON.stringify(validProfile),
  });
  assert.equal(job.status, 'queued');

  const cancelled = await adminCancelJob(ctx, job.id);
  assert.equal(cancelled.status, 'cancelled');

  const retry = await adminRetryJob(ctx, job.id);
  assert.equal(retry.retryOfJobId, job.id);
  assert.equal(retry.status, 'queued');
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
    configSnapshotJson: '{}',
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
        configSnapshotJson: '{}',
      }),
    AppError,
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
    profileId: 1,
    storageProfileVersionId: draft.id,
    configSnapshotJson: '{}',
  });
  assert.equal(testJob.kind, 'storage_test');

  await assert.rejects(() => adminMarkStorageTestPassed(ctx, draft.id), AppError);
  await adminMarkStorageTestPassed(ctx, draft.id, { allowBreakGlass: true });
  await adminActivateStorage(ctx, draft.id);
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
