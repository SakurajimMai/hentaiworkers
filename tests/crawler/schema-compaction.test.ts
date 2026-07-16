import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { CRAWLER_CONTROL_TABLES } from '../../lib/server/infrastructure/database/schema/crawler';

const root = process.cwd();
const coreSql = readFileSync(join(root, 'drizzle/core/0001-crawler-core.sql'), 'utf8');
const compactScript = readFileSync(join(root, 'scripts/compact-crawler-schema.mjs'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

const LEGACY_TABLES = [
  'crawler_profile_versions',
  'secret_versions',
  'secrets',
  'crawler_schedule_skips',
  'worker_credentials',
  'audit_logs',
  'media_assets',
] as const;

const RESTORED_RUNTIME_TABLES = [
  'storage_profiles',
  'storage_profile_versions',
  'crawler_media_uploads',
] as const;

test('fresh crawler baseline creates exactly the nine runtime tables', () => {
  const created = [...coreSql.matchAll(/CREATE TABLE IF NOT EXISTS `([^`]+)`/g)]
    .map((match) => match[1]);
  assert.deepEqual(created.sort(), [...CRAWLER_CONTROL_TABLES].sort());
  assert.equal(created.length, 9);
  for (const legacy of LEGACY_TABLES) assert.equal(created.includes(legacy), false);
});

test('restored storage and upload tables are excluded from destructive compaction', () => {
  const migrationConnection = readFileSync(
    join(root, 'scripts/lib/migration-connection.mjs'),
    'utf8',
  );
  const legacyBlock = migrationConnection.match(
    /CRAWLER_LEGACY_TABLES = Object\.freeze\(\[([\s\S]*?)\]\)/,
  )?.[1] ?? '';
  for (const table of RESTORED_RUNTIME_TABLES) {
    assert.equal(legacyBlock.includes(`'${table}'`), false);
  }
});

test('legacy compaction is opt-in, verifies backfill, and writes backup before drop', () => {
  assert.match(compactScript, /CRAWLER_COMPACT_CONFIRM/);
  assert.match(compactScript, /drop-legacy-tables/);
  assert.match(compactScript, /verifyBackfill/);
  assert.match(compactScript, /Legacy backup failed; refusing to drop tables/);
  const backupAt = compactScript.indexOf('backupLegacyTables');
  const dropAt = compactScript.indexOf('dropLegacyTables');
  assert.ok(backupAt >= 0);
  assert.ok(dropAt > backupAt);
  assert.match(compactScript, /--drop-legacy/);
});

test('package exposes separate fresh setup, upgrade migration, and compaction commands', () => {
  assert.equal(packageJson.scripts['db:setup:crawler'], 'node scripts/setup-crawler-core.mjs');
  assert.equal(packageJson.scripts['db:migrate:crawler'], 'node scripts/apply-crawler-migration.mjs');
  assert.equal(packageJson.scripts['db:compact:crawler'], 'node scripts/compact-crawler-schema.mjs');
});
