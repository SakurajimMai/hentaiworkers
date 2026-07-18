/**
 * Apply additive crawler control-plane migrations (0001, 0002, …).
 *
 * Safety:
 * - Only runs reviewed SQL under drizzle/migrations/
 * - Refuses DROP of catalog tables
 * - Records application in schema_migrations
 *
 * Usage:
 *   node scripts/apply-crawler-migration.mjs
 *   node scripts/apply-crawler-migration.mjs --dry-run
 *
 * Requires DATABASE_URL. Set CRAWLER_MIGRATE_CONFIRM=yes to apply to non-local hosts.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import mysql from 'mysql2/promise';

import {
  buildDatabaseConnectionSettings,
  CRAWLER_CONTROL_TABLES_FALLBACK,
} from './lib/migration-connection.mjs';
import { createSqlCompatibilityNormalizer } from './lib/sql-compat.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const migrationsDir = resolve(repositoryRoot, 'drizzle/migrations');
const CRAWLER_TABLES = CRAWLER_CONTROL_TABLES_FALLBACK;

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
  };
}

function listMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && /^\d{4}-/.test(name))
    .sort();
}

function loadMigrationSql(fileName) {
  const sql = readFileSync(join(migrationsDir, fileName), 'utf8');
  const catalogTables = ['animes', 'tags', 'anime_tags', 'categories', 'users'];
  for (const table of catalogTables) {
    // Hard-block DROP of catalog tables.
    if (new RegExp(`\\bDROP\\s+TABLE\\s+[\`']?${table}[\`']?`, 'i').test(sql)) {
      throw new Error(`Migration drops catalog table ${table}`);
    }
    // Allow additive ALTER ... ADD COLUMN only; block other mutations.
    const alterRe = new RegExp(
      `\\bALTER\\s+TABLE\\s+[\`']?${table}[\`']?\\s+([\\s\\S]*?)(?=;|$)`,
      'gi',
    );
    let match;
    while ((match = alterRe.exec(sql)) !== null) {
      const clause = match[1] ?? '';
      const isAdditiveColumn =
        /\bADD\s+COLUMN\b/i.test(clause)
        && !/\bDROP\b/i.test(clause)
        && !/\bMODIFY\b/i.test(clause)
        && !/\bCHANGE\b/i.test(clause)
        && !/\bRENAME\b/i.test(clause);
      if (!isAdditiveColumn) {
        throw new Error(`Migration mutates catalog table ${table} (non-additive ALTER)`);
      }
    }
  }
  if (/\bDROP\s+TABLE\b/i.test(sql)) {
    throw new Error('Migration contains DROP TABLE');
  }
  return sql;
}

function splitStatements(sql) {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/;+\s*$/, ''))
    .filter((s) => s.length > 0 && !s.split('\n').every((line) => line.trim().startsWith('--')));
}

function checksum(sql) {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

function isLocalHost(hostname) {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

async function ensureMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
      \`id\` VARCHAR(128) NOT NULL,
      \`checksum_sha256\` CHAR(64) NOT NULL,
      \`applied_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function alreadyApplied(connection, id) {
  const [rows] = await connection.query(
    'SELECT id, checksum_sha256 FROM schema_migrations WHERE id = ? LIMIT 1',
    [id],
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function listExistingControlTables(connection) {
  const [rows] = await connection.query(
    `SELECT table_name AS name
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN (${CRAWLER_TABLES.map(() => '?').join(',')})
     ORDER BY table_name`,
    [...CRAWLER_TABLES],
  );
  return rows.map((r) => r.name ?? r.TABLE_NAME ?? r.Name).filter(Boolean);
}

async function applyOne(connection, fileName, args, normalizeSql = (value) => value) {
  const migrationId = fileName.replace(/\.sql$/, '');
  const sourceSql = loadMigrationSql(fileName);
  // Checksum the reviewed source file; compatibility changes affect execution only.
  const hash = checksum(sourceSql);
  const statements = splitStatements(normalizeSql(sourceSql));

  if (args.dryRun) {
    console.log(
      JSON.stringify({ migration: migrationId, checksum: hash, statements: statements.length, dryRun: true }),
    );
    return { action: 'dry_run', migrationId };
  }

  const prior = await alreadyApplied(connection, migrationId);
  if (prior) {
    if (prior.checksum_sha256 !== hash) {
      throw new Error(
        `Migration ${migrationId} already applied with different checksum (db=${prior.checksum_sha256}, file=${hash})`,
      );
    }
    console.log(JSON.stringify({ action: 'already_applied', migration: migrationId }));
    return { action: 'already_applied', migrationId };
  }

  let applied = 0;
  for (const statement of statements) {
    try {
      await connection.query(statement);
      applied += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists|Duplicate column|Duplicate key name/i.test(message)) {
        applied += 1;
        continue;
      }
      console.error('Failed statement:', statement.slice(0, 240));
      throw error;
    }
  }

  await connection.query(
    'INSERT INTO schema_migrations (id, checksum_sha256) VALUES (?, ?)',
    [migrationId, hash],
  );

  console.log(
    JSON.stringify({ action: 'applied', migration: migrationId, statementsApplied: applied }),
  );
  return { action: 'applied', migrationId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });

  const files = listMigrationFiles();
  if (files.length === 0) {
    throw new Error('No migration SQL files found');
  }

  let settings;
  try {
    settings = buildDatabaseConnectionSettings(process.env, repositoryRoot);
  } catch (error) {
    const url = process.env.DATABASE_URL?.trim();
    const hostname = url
      ? new URL(url.replace(/^mysql:/i, 'http:')).hostname
      : 'unknown';
    if (!url || !isLocalHost(hostname)) {
      throw new Error(
        `Strict connection builder failed and non-local fallback is disabled: ${error.message}`,
      );
    }
    console.warn(
      `[warn] Strict builder failed on local host (${error.message}); using DATABASE_URL.`,
    );
    settings = {
      connectionOptions: { uri: url, connectTimeout: 20_000 },
      tlsRequired: false,
      hostname,
      database: new URL(url.replace(/^mysql:/i, 'http:')).pathname.replace(/^\//, ''),
    };
  }

  const hostname = settings.hostname
    || settings.connectionOptions.host
    || 'unknown';
  const database = settings.database || settings.connectionOptions.database || 'unknown';

  if (
    !args.dryRun
    && !isLocalHost(hostname)
    && process.env.CRAWLER_MIGRATE_CONFIRM !== 'yes'
  ) {
    console.error(
      JSON.stringify({
        error: 'Refusing non-local migration without confirmation',
        host: hostname,
        database,
        hint: 'Set CRAWLER_MIGRATE_CONFIRM=yes to apply.',
      }, null, 2),
    );
    process.exit(2);
  }

  console.log(JSON.stringify({
    host: hostname,
    database,
    files,
    dryRun: args.dryRun,
    tlsRequired: settings.tlsRequired ?? false,
  }, null, 2));

  if (args.dryRun) {
    for (const file of files) {
      await applyOne(null, file, args);
    }
    return;
  }

  const connection = await mysql.createConnection(settings.connectionOptions);
  try {
    const normalizeSql = await createSqlCompatibilityNormalizer(connection);
    await ensureMigrationsTable(connection);
    for (const file of files) {
      await applyOne(connection, file, args, normalizeSql);
    }
    const existing = await listExistingControlTables(connection);
    const missing = CRAWLER_TABLES.filter((t) => !existing.includes(t));
    if (missing.length > 0) {
      throw new Error(`Control tables missing after migrations: ${missing.join(', ')}`);
    }
    console.log(JSON.stringify({
      action: 'complete',
      tablesPresent: existing.length,
      expected: CRAWLER_TABLES.length,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
