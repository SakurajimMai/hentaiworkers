/**
 * Shared connection settings for reviewed migrations.
 * Prefer strict TLS when possible; callers may fall back to app-compatible URI.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const CRAWLER_CONTROL_TABLES_FALLBACK = Object.freeze([
  'crawler_profiles',
  'crawler_profile_versions',
  'storage_profiles',
  'storage_profile_versions',
  'secrets',
  'secret_versions',
  'crawler_schedules',
  'crawler_schedule_skips',
  'crawler_jobs',
  'crawler_job_attempts',
  'crawler_job_items',
  'crawler_job_events',
  'crawler_operation_receipts',
  'crawler_media_uploads',
  'crawler_workers',
  'worker_credentials',
  'audit_logs',
  'anime_sources',
  'media_assets',
]);

const loopbackAddresses = new BlockList();
loopbackAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
loopbackAddresses.addAddress('::1', 'ipv6');
loopbackAddresses.addSubnet('::ffff:7f00:0', 104, 'ipv6');

function normalizeDatabaseHostname(hostname) {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isLocalDatabaseHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isLoopbackIpLiteral(hostname) {
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) return loopbackAddresses.check(hostname, 'ipv4');
  if (ipVersion === 6) return loopbackAddresses.check(hostname, 'ipv6');
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
    relativePath === '..'
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
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

/**
 * @param {Record<string, string | undefined>} environment
 * @param {string} repositoryDirectory
 */
export function buildDatabaseConnectionSettings(environment, repositoryDirectory) {
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

  const tlsRequired = tlsMode === 'required';
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
    connectTimeout: 20_000,
    multipleStatements: false,
  };

  if (tlsRequired) {
    /** @type {import('mysql2').SslOptions} */
    const ssl = {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    };
    const caFile = environment.DATABASE_TLS_CA_FILE?.trim();
    if (caFile) {
      ssl.ca = readRepositoryCaFile(caFile, repositoryDirectory);
    }
    connectionOptions.ssl = ssl;
  }

  return {
    connectionOptions,
    tlsRequired,
    hostname,
    database,
    isLocal: isLocalDatabaseHost(hostname),
  };
}
