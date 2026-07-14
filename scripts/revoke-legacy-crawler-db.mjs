/**
 * Operational helper: revoke a *dedicated* legacy crawler MySQL account.
 *
 * Safety: if CRAWLER_DB_USER is empty or equals the DATABASE_URL user, this
 * script refuses to DROP — the app and legacy crawler historically shared one
 * account (sql23690_hentai). Shared accounts are cut over by deleting scripts
 * and scrubbing production_config.yml, not by dropping the app user.
 *
 * Usage:
 *   node scripts/revoke-legacy-crawler-db.mjs
 *   CRAWLER_DB_USER=crawler_legacy CRAWLER_DB_HOST=% node scripts/revoke-legacy-crawler-db.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import mysql from 'mysql2/promise';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseDatabaseUrl(url) {
  const normalized = url.replace(/^mysql:\/\//i, 'http://');
  const u = new URL(normalized);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '').split('?')[0],
  };
}

function quoteIdent(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

loadEnvFile(path.resolve('.env'));

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('DATABASE_URL is required (admin-capable session to run DROP USER).');
  process.exit(1);
}

const app = parseDatabaseUrl(databaseUrl);
const targetUser = (process.env.CRAWLER_DB_USER || '').trim();
const targetHost = (process.env.CRAWLER_DB_HOST || '%').trim() || '%';

if (!targetUser) {
  console.log(
    JSON.stringify(
      {
        action: 'skipped',
        reason:
          'CRAWLER_DB_USER not set. Legacy crawler used the same MySQL user as the app; DROP refused.',
        app_user: app.user,
        guidance:
          'Cutover = delete scripts + scrub scripts/production_config.yml. Only set CRAWLER_DB_USER if a dedicated crawler account exists.',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (targetUser === app.user) {
  console.error(
    JSON.stringify({
      action: 'aborted',
      reason: 'Refusing to DROP the application DATABASE_URL user',
      user: targetUser,
    }),
  );
  process.exit(2);
}

const conn = await mysql.createConnection({
  host: app.host,
  port: app.port,
  user: app.user,
  password: app.password,
  database: app.database,
  multipleStatements: false,
});

try {
  const account = `${quoteIdent(targetUser)}@${quoteIdent(targetHost)}`;
  console.log(`Revoking grants and dropping ${targetUser}@${targetHost} ...`);
  await conn.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${account}`);
  await conn.query(`DROP USER IF EXISTS ${account}`);
  await conn.query('FLUSH PRIVILEGES');
  console.log(
    JSON.stringify({
      action: 'revoked',
      user: targetUser,
      host: targetHost,
    }),
  );
} catch (error) {
  console.error('Failed to revoke crawler account:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await conn.end();
}
