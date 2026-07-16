import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import type { RowDataPacket } from 'mysql2';
import { join } from 'node:path';
import test from 'node:test';
import { CRAWLER_CONTROL_TABLES } from '../../lib/server/infrastructure/database/schema/crawler';

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle/migrations');

const CATALOG_TABLES = ['animes', 'tags', 'anime_tags', 'categories', 'users'] as const;

const REQUIRED_UNIQUE = [
  'crawler_jobs_schedule_scheduled_for_uidx',
  'crawler_job_events_job_attempt_seq_uidx',
  'crawler_job_items_job_source_uidx',
  'crawler_operation_receipts_scope_key_uidx',
  'anime_sources_source_uidx',
  'crawler_workers_token_hash_uidx',
] as const;

const REQUIRED_BINARY_HASH_COLUMNS = [
  'lease_token_hash',
  'source_key_hash',
  'idempotency_key_hash',
  'request_hash',
  'token_hash',
  'checksum_sha256',
  'nonce',
  'auth_tag',
  'ciphertext',
] as const;

function loadMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql') && /^\d{4}-/.test(name))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8'))
    .join('\n');
}

test('migration is additive and does not mutate catalog tables', () => {
  const sql = loadMigrationSql();
  // Never drop tables/columns.
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+COLUMN\b/i);

  for (const table of CATALOG_TABLES) {
    // Catalog DROP is always forbidden.
    assert.doesNotMatch(
      sql,
      new RegExp(`\\bDROP\\s+TABLE\\s+[\\\`']?${table}[\\\`']?`, 'i'),
    );
    // Catalog ALTER is only allowed as ADD COLUMN (e.g. users.session_version).
    const alterRe = new RegExp(
      `\\bALTER\\s+TABLE\\s+[\\\`']?${table}[\\\`']?\\s+([\\s\\S]*?)(?=;|$)`,
      'gi',
    );
    let match: RegExpExecArray | null;
    while ((match = alterRe.exec(sql)) !== null) {
      const clause = match[1] ?? '';
      const isAdditiveColumn =
        /\bADD\s+COLUMN\b/i.test(clause)
        && !/\bDROP\b/i.test(clause)
        && !/\bMODIFY\b/i.test(clause)
        && !/\bCHANGE\b/i.test(clause)
        && !/\bRENAME\b/i.test(clause);
      assert.ok(
        isAdditiveColumn,
        `catalog table ${table} may only receive additive ADD COLUMN`,
      );
    }
  }
  assert.match(sql, /\bADD\s+COLUMN\b/i);
  assert.match(sql, /session_version/i);
});

test('migration creates every control-plane table', () => {
  const sql = loadMigrationSql();
  for (const table of CRAWLER_CONTROL_TABLES) {
    assert.match(
      sql,
      new RegExp(`CREATE TABLE IF NOT EXISTS \\\`${table}\\\``, 'i'),
      `missing table ${table}`,
    );
  }
  assert.deepEqual(
    [...CRAWLER_CONTROL_TABLES].sort(),
    [
      'anime_sources',
      'crawler_job_attempts',
      'crawler_job_events',
      'crawler_job_items',
      'crawler_jobs',
      'crawler_operation_receipts',
      'crawler_profiles',
      'crawler_schedules',
      'crawler_workers',
    ].sort(),
  );
});

test('migration enforces binary hashes, UTC defaults, uniques, FKs and JSON_VALID', () => {
  const sql = loadMigrationSql();

  for (const column of REQUIRED_BINARY_HASH_COLUMNS) {
    assert.match(sql, new RegExp(`\`${column}\`\\s+(BINARY|VARBINARY)`, 'i'), column);
  }

  // MariaDB rejects DEFAULT UTC_TIMESTAMP(); use CURRENT_TIMESTAMP + session UTC.
  assert.match(sql, /DEFAULT CURRENT_TIMESTAMP/i);
  assert.match(sql, /ON UPDATE CURRENT_TIMESTAMP/i);
  assert.match(sql, /SET time_zone\s*=\s*'\+00:00'/i);

  for (const name of REQUIRED_UNIQUE) {
    assert.match(
      sql,
      new RegExp('UNIQUE KEY(?: IF NOT EXISTS)? `' + name + '`'),
      name,
    );
  }

  assert.match(sql, /FOREIGN KEY \(`profile_id`\) REFERENCES `crawler_profiles`/);
  assert.match(sql, /FOREIGN KEY \(`job_id`\) REFERENCES `crawler_jobs`/);
  assert.match(sql, /FOREIGN KEY \(`worker_id`\) REFERENCES `crawler_workers`/);

  assert.match(sql, /CHECK \(JSON_VALID\(`config_json`\)\)/);
  assert.match(sql, /CHECK \(JSON_VALID\(`config_snapshot_json`\)\)/);
  assert.match(sql, /CHECK \(JSON_VALID\(`response_json`\)\)/);
  assert.match(sql, /CHECK \(JSON_VALID\(`capabilities_json`\)\)/);
});

test('job status enum matches domain state machine', () => {
  const sql = loadMigrationSql();
  for (const status of [
    'queued',
    'leased',
    'running',
    'retry_wait',
    'cancel_requested',
    'succeeded',
    'partial_succeeded',
    'failed',
    'cancelled',
  ]) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
  assert.match(sql, /ENUM\('crawl', 'storage_test', 'cleanup'\)/);
});

/**
 * Optional live apply against a disposable database.
 * Set CRAWLER_MIGRATION_DATABASE_URL to run; otherwise skipped.
 * Never points this at production.
 */
test('optional disposable MariaDB apply (skipped without env)', async (t) => {
  const url = process.env.CRAWLER_MIGRATION_DATABASE_URL;
  if (!url) {
    t.skip('CRAWLER_MIGRATION_DATABASE_URL not set — static checks only');
    return;
  }
  if (!/localhost|127\.0\.0\.1|::1|mariadb|dispose|test/i.test(url)) {
    throw new Error('Refusing to apply crawler migration to a non-disposable host');
  }

  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection(url);
  try {
    const sql = loadMigrationSql();
    for (const statement of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
      if (statement.startsWith('--') || statement.startsWith('SET NAMES')) {
        if (statement.startsWith('SET NAMES')) {
          await connection.query(statement);
        }
        continue;
      }
      await connection.query(statement);
    }
    const [rows] = await connection.query<Array<RowDataPacket & { table_name: string }>>(
      `SELECT table_name AS table_name
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name LIKE 'crawler_%'`,
    );
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length >= 10);
  } finally {
    await connection.end();
  }
});
