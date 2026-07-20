import assert from 'node:assert/strict';
import test from 'node:test';
import { AdminCrawlerService } from '../../lib/server/crawler/application/admin-crawler-service';
import { CrawlerJobService } from '../../lib/server/crawler/application/crawler-job-service';
import { CrawlerScheduleService } from '../../lib/server/crawler/application/crawler-schedule-service';
import type { CrawlerProfileConfig } from '../../lib/server/crawler/domain/config';
import {
  createMariaDbCrawlerUnitOfWork,
  MariaDbCrawlerConfigRepository,
  type CrawlerSqlExecutor,
  type CrawlerTransactionConnection,
} from '../../lib/server/infrastructure/database/mariadb-crawler-repositories';

const profileConfig: CrawlerProfileConfig = {
  schemaVersion: 1,
  source: { baseUrl: 'https://example.com' },
  dateFilter: { years: [2026], months: [1] },
  qualityPriority: ['1080'],
  skipKeywords: [],
  concurrency: { download: 2, parse: 2 },
  continueOnError: true,
  maxActiveJobs: 1,
  skipExisting: true,
  requestDelaySeconds: 1,
  media: {
    enableVideo: true,
    enableCover: true,
    enableFanart: true,
    maxFanartImages: 50,
  },
};

function profileRow(input: { enabled?: boolean; version?: number } = {}) {
  return {
    id: 7,
    name: 'profile-7',
    version: input.version ?? 1,
    schema_version: 1,
    config_json: JSON.stringify(profileConfig),
    is_enabled: input.enabled === false ? 0 : 1,
    created_at: '2026-07-01 00:00:00',
    updated_at: '2026-07-01 00:00:00',
  };
}

function jobRow(input: { id: number; status: 'queued' | 'failed'; retryOfJobId?: number | null }) {
  return {
    id: input.id,
    kind: 'crawl',
    status: input.status,
    profile_id: 7,
    profile_version_id: 7,
    storage_profile_version_id: null,
    schedule_id: null,
    scheduled_for: null,
    config_snapshot_json: '{}',
    attempt_count: input.status === 'failed' ? 1 : 0,
    max_attempts: 3,
    lease_worker_id: null,
    lease_expires_at: null,
    progress_json: null,
    retry_of_job_id: input.retryOfJobId ?? null,
    next_retry_at: null,
    created_at: '2026-07-01 00:00:00',
    updated_at: '2026-07-01 00:00:00',
    started_at: input.status === 'failed' ? '2026-07-01 00:00:01' : null,
    finished_at: input.status === 'failed' ? '2026-07-01 00:00:02' : null,
  };
}

test('MariaDB storage_test job keeps nullable crawler profile id through insert and mapping', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized.startsWith('INSERT INTO crawler_jobs')) {
        return [{ affectedRows: 1, insertId: 44 }, []];
      }
      if (normalized === 'SELECT * FROM crawler_jobs WHERE id = ? LIMIT 1') {
        return [[{
          ...jobRow({ id: 44, status: 'queued' }),
          kind: 'storage_test',
          profile_id: null,
          profile_version_id: 0,
          storage_profile_version_id: 9,
        }], []];
      }
      throw new Error(`unexpected SQL: ${normalized}`);
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const jobs = new CrawlerJobService(createMariaDbCrawlerUnitOfWork(async () => connection));

  const job = await jobs.enqueueManual({
    kind: 'storage_test',
    profileId: null,
    profileVersionId: 0,
    storageProfileVersionId: 9,
    configSnapshotJson: '{"kind":"storage_test"}',
  });

  assert.equal(job.profileId, null);
  const insert = calls.find((call) => call.sql.startsWith('INSERT INTO crawler_jobs'));
  assert.equal(insert?.params[1], null);
});

function scheduleRow() {
  return {
    id: 9,
    profile_id: 7,
    profile_version_id: 7,
    storage_profile_version_id: null,
    name: 'manual',
    kind: 'manual',
    cron_expression: null,
    interval_seconds: null,
    timezone: 'UTC',
    overlap_policy: 'skip',
    misfire_policy: 'latest_only',
    catch_up_limit: 3,
    max_active_jobs: 1,
    is_enabled: 1,
    next_run_at: null,
    last_materialized_at: null,
    config_snapshot_json: JSON.stringify(profileConfig),
  };
}

test('MariaDB compressed profile SQL filters enabled rows and updates the current row in place', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string, params: unknown[] = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: normalized, params });
      if (normalized === 'SELECT id, name, is_enabled FROM crawler_profiles WHERE is_enabled = 1 ORDER BY id DESC') {
        return [[profileRow()], []];
      }
      if (normalized.startsWith('UPDATE crawler_profiles SET name = ?')) {
        return [{ affectedRows: 1 }, []];
      }
      if (normalized === 'SELECT * FROM crawler_profiles WHERE id = ? LIMIT 1') {
        return [[profileRow({ version: 2 })], []];
      }
      if (normalized === 'SELECT id, name, is_enabled FROM crawler_profiles WHERE id = ? LIMIT 1') {
        return [[profileRow()], []];
      }
      if (normalized.startsWith('UPDATE crawler_profiles SET is_enabled = 0')) {
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`unexpected SQL: ${normalized}`);
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);
  const profiles = new MariaDbCrawlerConfigRepository();

  await uow.runInTransaction(async () => {
    assert.equal((await profiles.listProfiles()).length, 1);
    assert.equal((await profiles.updateProfile(7, 'updated', profileConfig)).version, 2);
    await profiles.disableProfile(7);
    assert.equal((await profiles.getProfileVersion(7))?.version, 2);
  });

  const update = calls.find((call) => call.sql.startsWith('UPDATE crawler_profiles SET name = ?'));
  assert.equal(
    update?.sql,
    'UPDATE crawler_profiles SET name = ?, version = version + 1, schema_version = ?, config_json = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND is_enabled = 1',
  );
  assert.deepEqual(update?.params, ['updated', 1, JSON.stringify(profileConfig), 7]);
  assert.ok(calls.some((call) =>
    call.sql === 'UPDATE crawler_profiles SET is_enabled = 0, updated_at = UTC_TIMESTAMP() WHERE id = ? AND is_enabled = 1'
    && call.params[0] === 7));
});

test('MariaDB crawl enqueue locks the enabled profile before inserting the job', async () => {
  const calls: string[] = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push(normalized);
      if (normalized === 'SELECT id, is_enabled FROM crawler_profiles WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[profileRow()], []];
      }
      if (normalized.startsWith('INSERT INTO crawler_jobs')) {
        return [{ affectedRows: 1, insertId: 43 }, []];
      }
      if (normalized === 'SELECT * FROM crawler_jobs WHERE id = ? LIMIT 1') {
        return [[jobRow({ id: 43, status: 'queued' })], []];
      }
      throw new Error(`unexpected SQL: ${normalized}`);
    },
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
  };
  const jobs = new CrawlerJobService(createMariaDbCrawlerUnitOfWork(async () => connection));

  await jobs.enqueueManual({
    kind: 'crawl',
    profileId: 7,
    profileVersionId: 7,
    configSnapshotJson: JSON.stringify(profileConfig),
  });

  const lockIndex = calls.indexOf(
    'SELECT id, is_enabled FROM crawler_profiles WHERE id = ? LIMIT 1 FOR UPDATE',
  );
  const insertIndex = calls.findIndex((sql) => sql.startsWith('INSERT INTO crawler_jobs'));
  assert.ok(lockIndex > calls.indexOf('BEGIN'));
  assert.ok(insertIndex > lockIndex);
  assert.deepEqual(calls.slice(-2), ['COMMIT', 'RELEASE']);
});

test('MariaDB schedule creation locks the enabled profile before inserting the schedule', async () => {
  const calls: string[] = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push(normalized);
      if (normalized === 'SELECT id, is_enabled FROM crawler_profiles WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[profileRow()], []];
      }
      if (normalized.startsWith('INSERT INTO crawler_schedules')) {
        return [{ affectedRows: 1, insertId: 9 }, []];
      }
      if (normalized === 'SELECT * FROM crawler_schedules WHERE id = ? LIMIT 1') {
        return [[scheduleRow()], []];
      }
      throw new Error(`unexpected SQL: ${normalized}`);
    },
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
  };
  const schedules = new CrawlerScheduleService(
    createMariaDbCrawlerUnitOfWork(async () => connection),
  );

  await schedules.create({
    profileId: 7,
    profileVersionId: 7,
    name: 'manual',
    kind: 'manual',
    timezone: 'UTC',
    overlapPolicy: 'skip',
    misfirePolicy: 'latest_only',
    maxActiveJobs: 1,
    catchUpLimit: 3,
    configSnapshotJson: JSON.stringify(profileConfig),
  });

  const lockIndex = calls.indexOf(
    'SELECT id, is_enabled FROM crawler_profiles WHERE id = ? LIMIT 1 FOR UPDATE',
  );
  const insertIndex = calls.findIndex((sql) => sql.startsWith('INSERT INTO crawler_schedules'));
  assert.ok(lockIndex > calls.indexOf('BEGIN'));
  assert.ok(insertIndex > lockIndex);
});

test('MariaDB profile deletion locks and disables schedules/profile in one rollback boundary', async () => {
  const calls: string[] = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push(normalized);
      if (normalized === 'SELECT id, is_enabled FROM crawler_profiles WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[profileRow()], []];
      }
      if (normalized.startsWith('UPDATE crawler_schedules SET is_enabled = 0')) {
        return [{ affectedRows: 2 }, []];
      }
      if (normalized.startsWith('UPDATE crawler_profiles SET is_enabled = 0')) {
        throw new Error('profile disable failed');
      }
      throw new Error(`unexpected SQL: ${normalized}`);
    },
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);
  const crawler = new AdminCrawlerService({
    uow,
    schedules: new CrawlerScheduleService(uow),
    profiles: {
      async disableProfile() {
        throw new Error('profile disable escaped UOW');
      },
    },
  } as never);

  await assert.rejects(() => crawler.deleteProfile(7), /profile disable failed/);
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'RELEASE']);
  const lockIndex = calls.indexOf(
    'SELECT id, is_enabled FROM crawler_profiles WHERE id = ? LIMIT 1 FOR UPDATE',
  );
  const scheduleIndex = calls.findIndex((sql) =>
    sql.startsWith('UPDATE crawler_schedules SET is_enabled = 0'));
  const profileIndex = calls.findIndex((sql) =>
    sql.startsWith('UPDATE crawler_profiles SET is_enabled = 0'));
  assert.ok(lockIndex > calls.indexOf('BEGIN'));
  assert.ok(scheduleIndex > lockIndex);
  assert.ok(profileIndex > scheduleIndex);
  assert.equal(calls.includes('COMMIT'), false);
});

test('MariaDB crawler unit of work routes every repository query through its transaction connection', async () => {
  const calls: string[] = [];
  const connection: CrawlerSqlExecutor & {
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
  } = {
    async query(sql: string) {
      calls.push(sql);
      if (sql.includes('SELECT * FROM crawler_jobs')) return [[], []] as never;
      return [{ affectedRows: 0 }, []] as never;
    },
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
  };

  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);
  await uow.runInTransaction((repos) => repos.jobs.listQueued(4));

  assert.equal(calls[0], 'BEGIN');
  assert.ok(calls.some((value) => value.includes('SELECT * FROM crawler_jobs')));
  assert.deepEqual(calls.slice(-2), ['COMMIT', 'RELEASE']);
});

test('MariaDB worker claim control locks the worker row inside the transaction', async () => {
  const calls: string[] = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push(normalized);
      if (normalized === 'SELECT id, is_enabled, claim_enabled FROM crawler_workers WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[{ id: 7, is_enabled: 1, claim_enabled: 0 }], []];
      }
      throw new Error(`unexpected SQL: ${normalized}`);
    },
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);

  const worker = await uow.runInTransaction((repos) => repos.workers.getForUpdate(7));

  assert.deepEqual(worker, { id: 7, isEnabled: true, claimEnabled: false });
  assert.deepEqual(calls, [
    'BEGIN',
    'SELECT id, is_enabled, claim_enabled FROM crawler_workers WHERE id = ? LIMIT 1 FOR UPDATE',
    'COMMIT',
    'RELEASE',
  ]);
});

test('MariaDB crawler unit of work rolls back repository writes on failure', async () => {
  const calls: string[] = [];
  const connection = {
    async query(sql: string) {
      calls.push(sql);
      throw new Error('write failed');
    },
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);

  await assert.rejects(
    () => uow.runInTransaction((repos) => repos.jobs.listQueued(1)),
    /write failed/,
  );
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'RELEASE']);
  assert.equal(calls.includes('COMMIT'), false);
});

test('MariaDB terminal job deletion clears lineage and children before parent, then commits', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const lifecycle: string[] = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return [{ affectedRows: sql.includes('DELETE FROM crawler_jobs WHERE id') ? 1 : 2 }, []];
    },
    async beginTransaction() { lifecycle.push('BEGIN'); },
    async commit() { lifecycle.push('COMMIT'); },
    async rollback() { lifecycle.push('ROLLBACK'); },
    release() { lifecycle.push('RELEASE'); },
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);

  const deleted = await uow.runInTransaction((repos) => repos.jobs.deleteCascade(42));

  assert.equal(deleted, true);
  assert.deepEqual(lifecycle, ['BEGIN', 'COMMIT', 'RELEASE']);
  assert.deepEqual(
    calls.map((call) => call.sql),
    [
      'UPDATE crawler_jobs SET retry_of_job_id = NULL WHERE retry_of_job_id = ?',
      'DELETE FROM crawler_operation_receipts WHERE job_id = ? OR item_id IN (SELECT id FROM crawler_job_items WHERE job_id = ?)',
      'DELETE FROM crawler_media_uploads WHERE job_id = ?',
      'DELETE FROM crawler_job_events WHERE job_id = ?', 
      'DELETE FROM crawler_job_items WHERE job_id = ?',
      'DELETE FROM crawler_job_attempts WHERE job_id = ?',
      'DELETE FROM crawler_jobs WHERE id = ?',
    ],
  );
  assert.deepEqual(calls.map((call) => call.params), [
    [42], [42, 42], [42], [42], [42], [42], [42],
  ]);
});

test('MariaDB terminal job deletion rolls back when a child delete fails', async () => {
  const calls: string[] = [];
  const lifecycle: string[] = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push(normalized);
      if (normalized.startsWith('DELETE FROM crawler_job_items')) {
        throw new Error('item delete failed');
      }
      return [{ affectedRows: 1 }, []];
    },
    async beginTransaction() { lifecycle.push('BEGIN'); },
    async commit() { lifecycle.push('COMMIT'); },
    async rollback() { lifecycle.push('ROLLBACK'); },
    release() { lifecycle.push('RELEASE'); },
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);

  await assert.rejects(
    () => uow.runInTransaction((repos) => repos.jobs.deleteCascade(42)),
    /item delete failed/,
  );
  assert.deepEqual(lifecycle, ['BEGIN', 'ROLLBACK', 'RELEASE']);
  assert.equal(calls.some((sql) => sql === 'DELETE FROM crawler_jobs WHERE id = ?'), false);
});

test('MariaDB manual retry locks the terminal parent before inserting its retry', async () => {
  const calls: string[] = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push(normalized);
      if (normalized === 'SELECT * FROM crawler_jobs WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[jobRow({ id: 42, status: 'failed' })], []];
      }
      if (normalized === 'SELECT id, is_enabled FROM crawler_profiles WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[profileRow()], []];
      }
      if (normalized.startsWith('INSERT INTO crawler_jobs')) {
        return [{ affectedRows: 1, insertId: 43 }, []];
      }
      if (normalized === 'SELECT * FROM crawler_jobs WHERE id = ? LIMIT 1') {
        return [[jobRow({ id: 43, status: 'queued', retryOfJobId: 42 })], []];
      }
      throw new Error(`unexpected SQL: ${normalized}`);
    },
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
  };
  const jobs = new CrawlerJobService(createMariaDbCrawlerUnitOfWork(async () => connection));

  const retry = await jobs.manualRetry(42);

  assert.equal(retry.retryOfJobId, 42);
  const jobLockIndex = calls.indexOf('SELECT * FROM crawler_jobs WHERE id = ? LIMIT 1 FOR UPDATE');
  const profileLockIndex = calls.indexOf(
    'SELECT id, is_enabled FROM crawler_profiles WHERE id = ? LIMIT 1 FOR UPDATE',
  );
  const insertIndex = calls.findIndex((sql) => sql.startsWith('INSERT INTO crawler_jobs'));
  assert.ok(jobLockIndex > calls.indexOf('BEGIN'));
  assert.ok(profileLockIndex > jobLockIndex);
  assert.ok(insertIndex > profileLockIndex);
  assert.deepEqual(calls.slice(-2), ['COMMIT', 'RELEASE']);
});

test('MariaDB deleteJob locks the terminal parent before clearing lineage and children', async () => {
  const calls: string[] = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push(normalized);
      if (normalized === 'SELECT * FROM crawler_jobs WHERE id = ? LIMIT 1 FOR UPDATE') {
        return [[jobRow({ id: 42, status: 'failed' })], []];
      }
      return [{ affectedRows: 1 }, []];
    },
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
  };
  const jobs = new CrawlerJobService(createMariaDbCrawlerUnitOfWork(async () => connection));

  await jobs.deleteJob(42);

  const lockIndex = calls.indexOf('SELECT * FROM crawler_jobs WHERE id = ? LIMIT 1 FOR UPDATE');
  const lineageIndex = calls.indexOf(
    'UPDATE crawler_jobs SET retry_of_job_id = NULL WHERE retry_of_job_id = ?',
  );
  assert.ok(lockIndex > calls.indexOf('BEGIN'));
  assert.ok(lineageIndex > lockIndex);
  assert.deepEqual(calls.slice(-2), ['COMMIT', 'RELEASE']);
});

test('MariaDB purge locks selected terminal parent rows before cascade deletion', async () => {
  const calls: string[] = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push(normalized);
      if (normalized.startsWith('SELECT id FROM crawler_jobs')) {
        return [[{ id: 42 }], []];
      }
      return [{ affectedRows: 1 }, []];
    },
    async beginTransaction() { calls.push('BEGIN'); },
    async commit() { calls.push('COMMIT'); },
    async rollback() { calls.push('ROLLBACK'); },
    release() { calls.push('RELEASE'); },
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);

  const deleted = await uow.runInTransaction((repos) =>
    repos.jobs.deleteTerminalOlderThan({
      olderThanIso: '2026-07-10T00:00:00.000Z',
      statuses: ['failed'],
      limit: 2,
    }),
  );

  assert.equal(deleted, 1);
  const select = calls.find((sql) => sql.startsWith('SELECT id FROM crawler_jobs'));
  assert.ok(select?.endsWith('LIMIT ? FOR UPDATE'));
  assert.ok(calls.indexOf(select!) < calls.indexOf(
    'UPDATE crawler_jobs SET retry_of_job_id = NULL WHERE retry_of_job_id = ?',
  ));
  assert.deepEqual(calls.slice(-2), ['COMMIT', 'RELEASE']);
});
