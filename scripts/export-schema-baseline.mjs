import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { BlockList, isIP } from 'node:net';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import mysql from 'mysql2/promise';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const environmentPath = resolve(repositoryRoot, '.env');
const baselinePath = resolve(
  repositoryRoot,
  'drizzle/baseline/0000-production-schema.sql',
);

export const CONNECTION_TIMEOUT_MS = 15_000;
export const QUERY_TIMEOUT_MS = 15_000;

const loopbackAddresses = new BlockList();
loopbackAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
loopbackAddresses.addAddress('::1', 'ipv6');
loopbackAddresses.addSubnet('::ffff:7f00:0', 104, 'ipv6');

export const CORE_TABLES = Object.freeze([
  'animes',
  'tags',
  'anime_tags',
  'categories',
  'users',
]);

export function buildShowCreateTableQuery(tableName) {
  if (!CORE_TABLES.includes(tableName)) {
    throw new Error('不允许导出表：表名不在固定白名单中');
  }

  return `SHOW CREATE TABLE \`${tableName}\``;
}

export function extractCreateTable(row, tableName) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`无法读取表结构：${tableName}`);
  }

  for (const [columnName, value] of Object.entries(row)) {
    if (columnName.trim().toLowerCase() === 'create table' && typeof value === 'string') {
      return value;
    }
  }

  throw new Error(`SHOW CREATE TABLE 未返回建表语句：${tableName}`);
}

export function normalizeCreateTable(createTable) {
  return createTable
    .replace(/\r\n?/g, '\n')
    .replace(/\s+AUTO_INCREMENT\s*=\s*\d+\b/gi, '')
    .trim()
    .replace(/;+\s*$/, '');
}

function normalizeDatabaseHostname(hostname) {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isLocalDatabaseHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isLoopbackIpLiteral(hostname) {
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    return loopbackAddresses.check(hostname, 'ipv4');
  }
  if (ipVersion === 6) {
    return loopbackAddresses.check(hostname, 'ipv6');
  }
  return false;
}

function decodeUrlComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error('DATABASE_URL 包含无效百分号编码');
  }
}

function isOutsideDirectory(rootPath, candidatePath) {
  const relativePath = relative(rootPath, candidatePath);
  return (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  );
}

function readRepositoryCaFile(caFile, repositoryDirectory) {
  if (isAbsolute(caFile)) {
    throw new Error('DATABASE_TLS_CA_FILE 必须是仓库根目录内的相对路径');
  }

  const rootPath = realpathSync(resolve(repositoryDirectory));
  const unresolvedCaPath = resolve(rootPath, caFile);
  if (isOutsideDirectory(rootPath, unresolvedCaPath)) {
    throw new Error('DATABASE_TLS_CA_FILE 必须是仓库根目录内的相对路径');
  }

  const caPath = realpathSync(unresolvedCaPath);
  if (isOutsideDirectory(rootPath, caPath)) {
    throw new Error('DATABASE_TLS_CA_FILE 必须是仓库根目录内的相对路径');
  }

  return readFileSync(caPath, 'utf8');
}

export function buildDatabaseConnectionSettings(
  environment,
  repositoryDirectory = repositoryRoot,
) {
  const databaseUrl = environment.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('缺少 DATABASE_URL');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL 格式无效');
  }

  if (parsedUrl.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL 必须使用 mysql 协议');
  }
  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error('DATABASE_URL 不允许查询参数或片段');
  }

  const hostname = normalizeDatabaseHostname(parsedUrl.hostname);
  const database = decodeUrlComponent(parsedUrl.pathname.replace(/^\//, ''));
  if (!hostname || !database) {
    throw new Error('DATABASE_URL 必须包含主机名和数据库名');
  }

  const tlsMode = environment.DATABASE_TLS_MODE?.trim().toLowerCase() || 'required';
  if (tlsMode !== 'required' && tlsMode !== 'disabled') {
    throw new Error('DATABASE_TLS_MODE 只支持 required 或 disabled');
  }

  const tlsRequired = tlsMode !== 'disabled';
  if (!tlsRequired && !isLocalDatabaseHost(hostname)) {
    throw new Error('仅允许本地数据库禁用 TLS');
  }
  if (tlsRequired && isIP(hostname) !== 0 && !isLoopbackIpLiteral(hostname)) {
    throw new Error('远程数据库必须使用证书匹配的 DNS 主机名');
  }

  /** @type {import('mysql2').ConnectionOptions} */
  const connectionOptions = {
    host: hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : 3306,
    user: decodeUrlComponent(parsedUrl.username),
    password: decodeUrlComponent(parsedUrl.password),
    database,
    connectTimeout: CONNECTION_TIMEOUT_MS,
  };

  if (tlsRequired) {
    /** @type {import('mysql2').SslOptions} */
    const ssl = {
      rejectUnauthorized: true,
      verifyIdentity: true,
      minVersion: 'TLSv1.2',
    };
    const caFile = environment.DATABASE_TLS_CA_FILE?.trim();
    if (caFile) {
      ssl.ca = readRepositoryCaFile(caFile, repositoryDirectory);
    }
    connectionOptions.ssl = ssl;
  }

  return { connectionOptions, tlsRequired };
}

/**
 * @param {{
 *   environment?: Record<string, string | undefined>,
 *   repositoryDirectory?: string,
 *   environmentFile?: string,
 *   loadEnvironment?: (options: {
 *     path: string,
 *     quiet: boolean,
 *     processEnv: Record<string, string | undefined>,
 *   }) => unknown,
 * }} [options]
 */
export function loadDatabaseConnectionSettings({
  environment = process.env,
  repositoryDirectory = repositoryRoot,
  environmentFile = environmentPath,
  loadEnvironment = loadEnv,
} = {}) {
  loadEnvironment({
    path: environmentFile,
    quiet: true,
    processEnv: environment,
  });

  return buildDatabaseConnectionSettings(environment, repositoryDirectory);
}

function buildBaselineSql(createTables) {
  const statements = CORE_TABLES.map((tableName) => {
    const createTable = createTables.get(tableName);
    if (!createTable) {
      throw new Error(`缺少表结构：${tableName}`);
    }
    return `${normalizeCreateTable(createTable)};`;
  });

  return [
    '-- Production MariaDB schema baseline.',
    '-- Generated from SHOW CREATE TABLE; schema only, no table data.',
    ...statements,
  ].join('\n\n') + '\n';
}

async function queryWithTimeout(connection, sql) {
  return connection.query({ sql, timeout: QUERY_TIMEOUT_MS });
}

async function verifySecureSession(connection) {
  const [rows] = await queryWithTimeout(
    connection,
    "SHOW SESSION STATUS LIKE 'Ssl_cipher'",
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  const cipher = row && typeof row === 'object'
    ? Object.entries(row).find(([columnName]) => {
      const normalized = columnName.trim().toLowerCase();
      return normalized === 'value' || normalized === 'variable_value';
    })?.[1]
    : undefined;

  if (typeof cipher !== 'string' || cipher.trim() === '') {
    throw new Error('TLS 会话验证失败：Ssl_cipher 为空');
  }
}

export async function readCreateTables(
  connection,
  { tlsRequired = true, logTable = () => {} } = {},
) {
  if (tlsRequired) {
    await verifySecureSession(connection);
  }

  const createTables = new Map();
  for (const tableName of CORE_TABLES) {
    const [rows] = await queryWithTimeout(
      connection,
      buildShowCreateTableQuery(tableName),
    );
    const row = Array.isArray(rows) ? rows[0] : undefined;
    const createTable = extractCreateTable(row, tableName);
    createTables.set(tableName, createTable);
    logTable(tableName);
  }

  return createTables;
}

export async function writeBaselineAtomically(outputPath, content) {
  const outputDirectory = dirname(outputPath);
  const temporaryPath = resolve(
    outputDirectory,
    `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  await mkdir(outputDirectory, { recursive: true });
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function exportSchemaBaseline() {
  const settings = loadDatabaseConnectionSettings();
  let createTables;
  let connection;

  try {
    connection = await mysql.createConnection(settings.connectionOptions);
    createTables = await readCreateTables(connection, {
      tlsRequired: settings.tlsRequired,
      logTable: (tableName) => console.log(`已读取表结构：${tableName}`),
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }

  await writeBaselineAtomically(baselinePath, buildBaselineSql(createTables));

  const displayPath = relative(repositoryRoot, baselinePath).replaceAll('\\', '/');
  console.log(`已写入基线：${displayPath}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  exportSchemaBaseline().catch(() => {
    console.error('数据库结构基线导出失败；请检查 .env、网络和只读权限。');
    process.exitCode = 1;
  });
}
