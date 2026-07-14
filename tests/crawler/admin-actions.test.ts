import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminActivateStorage,
  adminCancelJob,
  adminConfirmYamlImport,
  adminCreateProfile,
  adminCreateSecret,
  adminCreateStorageDraft,
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
          throw new AppError('WORKER_FORBIDDEN', '需要管理员', 403);
        }
        return {
          id: 1,
          username: 'admin',
          role: 'admin' as const,
          isActive: 1,
          passwordHash: 'x',
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

test('schedule save validates definition', async () => {
  const ctx = makeCtx();
  const schedule = await adminSaveSchedule(ctx, {
    profileId: 1,
    profileVersionId: 1,
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
        profileId: 1,
        profileVersionId: 1,
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
