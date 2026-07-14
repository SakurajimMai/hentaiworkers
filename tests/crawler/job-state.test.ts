import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createManualRetrySeed,
  isTerminalJobStatus,
  resolveFinalStatus,
  transitionJobStatus,
  type CrawlerJobStatus,
} from '../../lib/server/crawler/domain/job';
import {
  canStartAdditionalJob,
  isValidFiveFieldCron,
  materializeMisfirePoints,
  validateScheduleDefinition,
} from '../../lib/server/crawler/domain/schedule';
import {
  parseCrawlerProfileConfig,
  parseStorageConfig,
} from '../../lib/server/crawler/domain/config';

test('queued can be claimed or cancelled', () => {
  assert.deepEqual(transitionJobStatus('queued', { type: 'claim' }), {
    ok: true,
    status: 'leased',
  });
  assert.deepEqual(transitionJobStatus('queued', { type: 'cancel' }), {
    ok: true,
    status: 'cancelled',
  });
  assert.equal(transitionJobStatus('queued', { type: 'start' }).ok, false);
});

test('leased/running cancel becomes cancel_requested; ack becomes cancelled', () => {
  assert.deepEqual(transitionJobStatus('leased', { type: 'cancel' }), {
    ok: true,
    status: 'cancel_requested',
  });
  assert.deepEqual(transitionJobStatus('running', { type: 'cancel' }), {
    ok: true,
    status: 'cancel_requested',
  });
  assert.deepEqual(transitionJobStatus('cancel_requested', { type: 'cancel_ack' }), {
    ok: true,
    status: 'cancelled',
  });
  assert.deepEqual(
    transitionJobStatus('cancel_requested', { type: 'lease_expire', retriesRemaining: 2 }),
    { ok: true, status: 'cancelled' },
  );
});

test('retry_wait returns to queued or cancels while waiting', () => {
  assert.deepEqual(transitionJobStatus('retry_wait', { type: 'retry_ready' }), {
    ok: true,
    status: 'queued',
  });
  assert.deepEqual(transitionJobStatus('retry_wait', { type: 'cancel' }), {
    ok: true,
    status: 'cancelled',
  });
});

test('lease expiry requeues when retries remain otherwise fails', () => {
  assert.deepEqual(
    transitionJobStatus('running', { type: 'lease_expire', retriesRemaining: 1 }),
    { ok: true, status: 'queued' },
  );
  assert.deepEqual(
    transitionJobStatus('leased', { type: 'lease_expire', retriesRemaining: 0 }),
    { ok: true, status: 'failed' },
  );
});

test('partial success and continueOnError resolution', () => {
  assert.deepEqual(transitionJobStatus('running', { type: 'partial_succeed' }), {
    ok: true,
    status: 'partial_succeeded',
  });
  assert.equal(
    resolveFinalStatus({ continueOnError: true, succeededItems: 2, failedItems: 1 }),
    'partial_succeeded',
  );
  assert.equal(
    resolveFinalStatus({ continueOnError: false, succeededItems: 2, failedItems: 1 }),
    'failed',
  );
  assert.equal(
    resolveFinalStatus({ continueOnError: true, succeededItems: 3, failedItems: 0 }),
    'succeeded',
  );
});

test('terminal statuses are immutable', () => {
  for (const status of [
    'succeeded',
    'partial_succeeded',
    'failed',
    'cancelled',
  ] as const satisfies readonly CrawlerJobStatus[]) {
    assert.equal(isTerminalJobStatus(status), true);
    assert.deepEqual(transitionJobStatus(status, { type: 'claim' }), {
      ok: false,
      reason: 'terminal',
    });
    assert.deepEqual(transitionJobStatus(status, { type: 'cancel' }), {
      ok: false,
      reason: 'terminal',
    });
  }
});

test('cancel wins over complete when already cancel_requested', () => {
  assert.deepEqual(
    transitionJobStatus('cancel_requested', { type: 'complete', outcome: 'succeeded' }),
    { ok: false, reason: 'conflict' },
  );
  assert.deepEqual(
    transitionJobStatus('cancel_requested', { type: 'succeed' }),
    { ok: false, reason: 'conflict' },
  );
  assert.deepEqual(
    transitionJobStatus('running', { type: 'complete', outcome: 'succeeded' }),
    { ok: true, status: 'succeeded' },
  );
});

test('manual retry creates a new linked job seed from terminal status', () => {
  const seed = createManualRetrySeed({
    status: 'failed',
    kind: 'crawl',
    profileVersionId: 9,
    configSnapshotJson: '{"schemaVersion":1}',
    maxAttempts: 3,
    jobId: 42,
  });
  assert.equal(seed.retryOfJobId, 42);
  assert.equal(seed.profileVersionId, 9);
  assert.throws(() =>
    createManualRetrySeed({
      status: 'running',
      kind: 'crawl',
      profileVersionId: 1,
      configSnapshotJson: '{}',
      maxAttempts: 3,
      jobId: 1,
    }),
  );
});

test('retryable fail goes to retry_wait; non-retryable fails', () => {
  assert.deepEqual(
    transitionJobStatus('running', {
      type: 'fail',
      retryable: true,
      retriesRemaining: 2,
    }),
    { ok: true, status: 'retry_wait' },
  );
  assert.deepEqual(
    transitionJobStatus('running', {
      type: 'fail',
      retryable: true,
      retriesRemaining: 0,
    }),
    { ok: true, status: 'failed' },
  );
});

test('schedule helpers: cron, misfire cap, concurrency', () => {
  assert.equal(isValidFiveFieldCron('0 3 * * *'), true);
  assert.equal(isValidFiveFieldCron('0 3 * * * *'), false);
  assert.equal(materializeMisfirePoints({ policy: 'skip', overdueCount: 5 }), 0);
  assert.equal(materializeMisfirePoints({ policy: 'latest_only', overdueCount: 5 }), 1);
  assert.equal(
    materializeMisfirePoints({ policy: 'catch_up', overdueCount: 10, catchUpLimit: 3 }),
    3,
  );
  assert.equal(
    canStartAdditionalJob({ activeJobs: 1, maxActiveJobs: 1, overlapPolicy: 'parallel' }),
    false,
  );
  assert.equal(
    canStartAdditionalJob({ activeJobs: 0, maxActiveJobs: 1, overlapPolicy: 'skip' }),
    true,
  );

  const errors = validateScheduleDefinition({
    kind: 'cron',
    cron: 'bad',
    timezone: 'Asia/Shanghai',
    overlapPolicy: 'skip',
    misfirePolicy: 'latest_only',
    maxActiveJobs: 1,
    catchUpLimit: 3,
  });
  assert.ok(errors.some((e) => e.includes('cron')));
});

test('config schemas accept s3/sftp and crawler profile', () => {
  const profile = parseCrawlerProfileConfig({
    schemaVersion: 1,
    source: { baseUrl: 'https://example.com' },
    dateFilter: { years: [2026], months: [1, 2] },
    qualityPriority: ['1080', '720'],
    concurrency: { download: 2, parse: 2 },
  });
  assert.equal(profile.maxActiveJobs, 1);

  const s3 = parseStorageConfig({
    driver: 's3',
    endpoint: 'https://s3.example.com',
    region: 'auto',
    bucket: 'media',
    prefix: 'anime/',
  });
  assert.equal(s3.driver, 's3');

  const sftp = parseStorageConfig({
    driver: 'sftp',
    host: 'sftp.example.com',
    username: 'uploader',
    rootPath: '/data',
    hostKeyFingerprint: 'sha256:abcdefghijklmnop',
  });
  assert.equal(sftp.driver, 'sftp');
});
