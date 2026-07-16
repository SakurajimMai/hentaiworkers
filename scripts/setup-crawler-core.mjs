import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import mysql from 'mysql2/promise';
import {
  buildDatabaseConnectionSettings,
  CRAWLER_CONTROL_TABLES_FALLBACK,
  CRAWLER_LEGACY_TABLES,
} from './lib/migration-connection.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreSqlPath = resolve(root, 'drizzle/core/0001-crawler-core.sql');
const migrationsPath = resolve(root, 'drizzle/migrations');

function splitStatements(sql) {
  return sql
    .split(/;\s*\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^--[^\n]*\n/gm, '').trim())
    .filter(Boolean);
}

function checksum(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isLocal(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

async function main() {
  loadEnv({ path: resolve(root, '.env'), quiet: true });
  const dryRun = process.argv.includes('--dry-run');
  const settings = buildDatabaseConnectionSettings(process.env, root);
  if (!dryRun && !isLocal(settings.hostname) && process.env.CRAWLER_MIGRATE_CONFIRM !== 'yes') {
    throw new Error('Refusing non-local setup without CRAWLER_MIGRATE_CONFIRM=yes');
  }

  const sql = readFileSync(coreSqlPath, 'utf8');
  const statements = splitStatements(sql);
  if (dryRun) {
    console.log(JSON.stringify({ action: 'dry_run', tables: CRAWLER_CONTROL_TABLES_FALLBACK, statements: statements.length }, null, 2));
    return;
  }

  const connection = await mysql.createConnection(settings.connectionOptions);
  try {
    const allKnown = [...CRAWLER_CONTROL_TABLES_FALLBACK, ...CRAWLER_LEGACY_TABLES];
    const [rows] = await connection.query(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name IN (${allKnown.map(() => '?').join(',')})`,
      allKnown,
    );
    const existing = rows.map((row) => String(row.name));
    const existingCore = existing.filter((name) => CRAWLER_CONTROL_TABLES_FALLBACK.includes(name));
    const existingLegacy = existing.filter((name) => CRAWLER_LEGACY_TABLES.includes(name));

    if (existingLegacy.length) {
      throw new Error(
        `Core setup refuses databases that still contain legacy crawler tables: ${existingLegacy.join(', ')}. ` +
          'Use db:migrate:crawler + db:compact:crawler instead.',
      );
    }

    if (existingCore.length && existingCore.length !== CRAWLER_CONTROL_TABLES_FALLBACK.length) {
      throw new Error(
        `Partial crawler core schema detected (${existingCore.join(', ')}). ` +
          'Drop the incomplete tables or finish setup manually before retrying.',
      );
    }

    if (existingCore.length === 0) {
      for (const statement of statements) await connection.query(statement);
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(128) NOT NULL,
        checksum_sha256 CHAR(64) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const file of ['0001-crawler-control.sql', '0002-crawler-control-align.sql', '0005-crawler-core-compact.sql']) {
      const migrationSql = readFileSync(resolve(migrationsPath, file), 'utf8');
      await connection.query(
        `INSERT INTO schema_migrations (id, checksum_sha256) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE checksum_sha256 = VALUES(checksum_sha256)`,
        [file.replace(/\.sql$/, ''), checksum(migrationSql)],
      );
    }

    console.log(JSON.stringify({
      action: existingCore.length ? 'already_present' : 'created',
      tableCount: CRAWLER_CONTROL_TABLES_FALLBACK.length,
      tables: CRAWLER_CONTROL_TABLES_FALLBACK,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
