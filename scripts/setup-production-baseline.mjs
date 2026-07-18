import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import mysql from 'mysql2/promise';
import { buildDatabaseConnectionSettings } from './lib/migration-connection.mjs';
import { createSqlCompatibilityNormalizer } from './lib/sql-compat.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = resolve(root, 'drizzle/baseline/0000-production-schema.sql');

function splitStatements(sql) {
  return sql
    .split(/;\s*\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^--[^\n]*(?:\n|$)/gm, '').trim())
    .filter(Boolean);
}

async function main() {
  loadEnv({ path: resolve(root, '.env'), quiet: true });
  const settings = buildDatabaseConnectionSettings(process.env, root);
  if (!settings.isLocal && process.env.CRAWLER_MIGRATE_CONFIRM !== 'yes') {
    throw new Error('Refusing non-local setup without CRAWLER_MIGRATE_CONFIRM=yes');
  }

  const connection = await mysql.createConnection(settings.connectionOptions);
  try {
    const [rows] = await connection.query(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY table_name`,
    );
    if (rows.length > 0) {
      throw new Error(
        `Production baseline setup requires an empty database; found ${rows.length} table(s)`,
      );
    }

    const normalizeSql = await createSqlCompatibilityNormalizer(connection);
    const statements = splitStatements(
      normalizeSql(readFileSync(baselinePath, 'utf8')),
    );
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const statement of statements) {
        await connection.query(statement);
      }
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    console.log(JSON.stringify({
      action: 'production_baseline_created',
      statementsApplied: statements.length,
      database: settings.database,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
