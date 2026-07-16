import { once } from 'node:events';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import mysql from 'mysql2/promise';
import {
  buildDatabaseConnectionSettings,
  CRAWLER_CONTROL_TABLES_FALLBACK,
  CRAWLER_LEGACY_TABLES,
} from './lib/migration-connection.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const DROP_CONFIRMATION = 'drop-legacy-tables';
const PAGE_SIZE = 1000;

function parseArgs(argv) {
  return {
    dropLegacy: argv.includes('--drop-legacy'),
  };
}

function isLocal(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function safeFileName(table) {
  if (!CRAWLER_LEGACY_TABLES.includes(table)) throw new Error(`Unexpected table ${table}`);
  return table;
}

function jsonValue(value) {
  if (Buffer.isBuffer(value)) return { type: 'base64', value: value.toString('base64') };
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function listTables(connection, candidates) {
  const [rows] = await connection.query(
    `SELECT table_name AS name
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN (${candidates.map(() => '?').join(',')})
     ORDER BY table_name`,
    candidates,
  );
  return rows.map((row) => String(row.name));
}

async function tableCounts(connection, tables) {
  const result = {};
  for (const table of tables) {
    const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${safeFileName(table)}\``);
    result[table] = Number(rows[0]?.count ?? 0);
  }
  return result;
}

export async function verifyBackfill(connection, existingLegacy) {
  const core = await listTables(connection, CRAWLER_CONTROL_TABLES_FALLBACK);
  const missing = CRAWLER_CONTROL_TABLES_FALLBACK.filter((table) => !core.includes(table));
  if (missing.length) throw new Error(`Core tables missing: ${missing.join(', ')}`);

  const [profileRows] = await connection.query(
    `SELECT COUNT(*) AS count FROM crawler_profiles
     WHERE config_json IS NULL OR NOT JSON_VALID(config_json)`,
  );
  if (Number(profileRows[0]?.count ?? 0) > 0) {
    throw new Error('Crawler profile backfill is incomplete');
  }

  const [workerRows] = await connection.query(
    `SELECT COUNT(*) AS count FROM crawler_workers
     WHERE scope_json IS NULL OR NOT JSON_VALID(scope_json)`,
  );
  if (Number(workerRows[0]?.count ?? 0) > 0) {
    throw new Error('Crawler worker scope backfill is incomplete');
  }

  if (existingLegacy.includes('worker_credentials')) {
    const [duplicates] = await connection.query(
      `SELECT worker_id, COUNT(*) AS count
       FROM worker_credentials
       WHERE is_revoked = 0 AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())
       GROUP BY worker_id HAVING COUNT(*) > 1`,
    );
    if (duplicates.length) {
      throw new Error('A Worker has multiple active credentials; revoke extras before compaction');
    }

    const [unmapped] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM worker_credentials c
       INNER JOIN crawler_workers w ON w.id = c.worker_id
       WHERE c.is_revoked = 0
         AND (c.expires_at IS NULL OR c.expires_at > UTC_TIMESTAMP())
         AND (w.token_hash IS NULL OR w.token_hash <> c.token_hash)`,
    );
    if (Number(unmapped[0]?.count ?? 0) > 0) {
      throw new Error('Active Worker credentials were not migrated into crawler_workers');
    }
  }

  return { coreTables: core.length, legacyTables: existingLegacy.length };
}

async function writeLine(stream, line) {
  if (!stream.write(line)) await once(stream, 'drain');
}

export async function backupLegacyTables(connection, tables) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = resolve(repositoryRoot, 'backups', `crawler-legacy-${stamp}`);
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const manifest = { createdAt: new Date().toISOString(), tables: {} };

  for (const table of tables) {
    safeFileName(table);
    const file = resolve(backupDirectory, `${table}.ndjson`);
    const stream = createWriteStream(file, { encoding: 'utf8', mode: 0o600 });
    let lastId = 0;
    let count = 0;
    try {
      for (;;) {
        const [rows] = await connection.query(
          `SELECT * FROM \`${table}\` WHERE id > ? ORDER BY id ASC LIMIT ?`,
          [lastId, PAGE_SIZE],
        );
        if (!rows.length) break;
        for (const row of rows) {
          const serialized = JSON.stringify(row, (_key, value) => jsonValue(value));
          await writeLine(stream, `${serialized}\n`);
          lastId = Number(row.id);
          count += 1;
        }
      }
    } finally {
      stream.end();
      await once(stream, 'close');
    }
    manifest.tables[table] = { rows: count, file: `${table}.ndjson` };
  }

  writeFileSync(
    resolve(backupDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  return backupDirectory;
}

export async function dropLegacyTables(connection, tables) {
  const dropOrder = [
    'crawler_media_uploads',
    'crawler_schedule_skips',
    'worker_credentials',
    'crawler_profile_versions',
    'storage_profile_versions',
    'storage_profiles',
    'secret_versions',
    'secrets',
    'audit_logs',
    'media_assets',
  ];
  for (const table of dropOrder) {
    if (!tables.includes(table)) continue;
    await connection.query(`DROP TABLE \`${safeFileName(table)}\``);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });
  const settings = buildDatabaseConnectionSettings(process.env, repositoryRoot);

  if (!isLocal(settings.hostname) && process.env.CRAWLER_MIGRATE_CONFIRM !== 'yes') {
    throw new Error('Refusing non-local schema audit without CRAWLER_MIGRATE_CONFIRM=yes');
  }
  if (
    args.dropLegacy
    && process.env.CRAWLER_COMPACT_CONFIRM !== DROP_CONFIRMATION
  ) {
    throw new Error(`Set CRAWLER_COMPACT_CONFIRM=${DROP_CONFIRMATION} before dropping legacy tables`);
  }

  const connection = await mysql.createConnection(settings.connectionOptions);
  try {
    const existingLegacy = await listTables(connection, CRAWLER_LEGACY_TABLES);
    const verification = await verifyBackfill(connection, existingLegacy);
    const counts = await tableCounts(connection, existingLegacy);

    if (!args.dropLegacy) {
      console.log(JSON.stringify({
        action: 'audit',
        ...verification,
        legacy: counts,
        hint: existingLegacy.length
          ? `Run migrations, then use --drop-legacy with CRAWLER_COMPACT_CONFIRM=${DROP_CONFIRMATION}`
          : 'Schema is already compact',
      }, null, 2));
      return;
    }

    if (!existingLegacy.length) {
      console.log(JSON.stringify({
        action: 'already_compact',
        dropped: [],
        coreTables: CRAWLER_CONTROL_TABLES_FALLBACK,
      }, null, 2));
      return;
    }

    let backupDirectory;
    try {
      backupDirectory = await backupLegacyTables(connection, existingLegacy);
    } catch (error) {
      throw new Error(
        `Legacy backup failed; refusing to drop tables. ${error instanceof Error ? error.message : error}`,
      );
    }

    await dropLegacyTables(connection, existingLegacy);
    console.log(JSON.stringify({
      action: 'compacted',
      dropped: existingLegacy,
      backupDirectory,
      coreTables: CRAWLER_CONTROL_TABLES_FALLBACK,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
