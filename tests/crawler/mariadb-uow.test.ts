import assert from 'node:assert/strict';
import test from 'node:test';
import { CrawlerJobService } from '../../lib/server/crawler/application/crawler-job-service';
import {
  createMariaDbCrawlerUnitOfWork,
  type CrawlerSqlExecutor,
  type CrawlerTransactionConnection,
} from '../../lib/server/infrastructure/database/mariadb-crawler-repositories';

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
  const lockIndex = calls.indexOf('SELECT * FROM crawler_jobs WHERE id = ? LIMIT 1 FOR UPDATE');
  const insertIndex = calls.findIndex((sql) => sql.startsWith('INSERT INTO crawler_jobs'));
  assert.ok(lockIndex > calls.indexOf('BEGIN'));
  assert.ok(insertIndex > lockIndex);
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
