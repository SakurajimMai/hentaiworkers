import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';
import { posix, win32 } from 'node:path';
import { z } from 'zod';
import { AppError } from './errors';

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;
export type NodeEnvironment = 'development' | 'test' | 'production';
export type DatabaseTlsMode = 'required' | 'disabled';

export type DatabaseConfig = Readonly<{
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  tls: Readonly<{
    mode: DatabaseTlsMode;
    caFile?: string;
  }>;
  pool: Readonly<{
    connectionLimit: number;
    maxIdle: number;
    idleTimeoutMs: number;
    connectTimeoutMs: number;
  }>;
}>;

export type AppConfig = Readonly<{
  nodeEnv: NodeEnvironment;
  database: DatabaseConfig;
  sessionSecret: string;
  encryption: Readonly<{
    currentKeyId: string;
    keys: Readonly<Record<string, Uint8Array>>;
  }>;
}>;

type ConfigIssue = Readonly<{
  field: string;
  message: string;
}>;

function integerEnvironment(
  field: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
) {
  return z.preprocess(
    (value) => value === undefined ? String(defaultValue) : value,
    z.string()
      .regex(/^\d+$/, { message: `${field} 必须是整数` })
      .transform(Number)
      .refine(
        (value) => value >= minimum && value <= maximum,
        { message: `${field} 超出允许范围` },
      ),
  );
}

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  DATABASE_TLS_MODE: z.enum(['required', 'disabled']).default('required'),
  DATABASE_TLS_CA_FILE: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().min(1).optional(),
  ),
  DATABASE_POOL_CONNECTION_LIMIT: integerEnvironment(
    'DATABASE_POOL_CONNECTION_LIMIT',
    8,
    1,
    100,
  ),
  DATABASE_POOL_MAX_IDLE: integerEnvironment(
    'DATABASE_POOL_MAX_IDLE',
    4,
    0,
    100,
  ),
  DATABASE_POOL_IDLE_TIMEOUT_MS: integerEnvironment(
    'DATABASE_POOL_IDLE_TIMEOUT_MS',
    30_000,
    1,
    3_600_000,
  ),
  DATABASE_CONNECT_TIMEOUT_MS: integerEnvironment(
    'DATABASE_CONNECT_TIMEOUT_MS',
    20_000,
    1,
    300_000,
  ),
  SESSION_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEYRING: z.string().min(1),
  APP_ENCRYPTION_CURRENT_KEY_ID: z.string().min(1),
});

function configInvalid(issues: readonly ConfigIssue[]): never {
  throw new AppError(
    'CONFIG_INVALID',
    '应用配置无效',
    500,
    false,
    { issues },
  );
}

function decodeUrlField(value: string, field: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    configInvalid([{ field, message: 'URL 编码无效' }]);
  }
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isDnsHost(host: string): boolean {
  return host.length <= 253 && host.split('.').every(
    (label) => /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/i.test(label),
  );
}

function parseDatabaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    configInvalid([{ field: 'DATABASE_URL', message: '必须是有效 URL' }]);
  }

  if (url.protocol !== 'mysql:') {
    configInvalid([{ field: 'DATABASE_URL', message: '只允许 mysql 协议' }]);
  }
  if (url.search || url.hash) {
    configInvalid([{ field: 'DATABASE_URL', message: '不允许查询参数或片段' }]);
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || !url.username) {
    configInvalid([{ field: 'DATABASE_URL', message: '必须包含主机和用户名' }]);
  }
  if (!isLoopbackHost(host) && (isIP(host) !== 0 || !isDnsHost(host))) {
    configInvalid([{ field: 'DATABASE_URL', message: '远程数据库必须使用 DNS 主机名' }]);
  }

  const encodedDatabase = url.pathname.replace(/^\//, '');
  const database = decodeUrlField(encodedDatabase, 'DATABASE_URL');
  if (!database || database.includes('/')) {
    configInvalid([{ field: 'DATABASE_URL', message: '必须包含单一数据库名称' }]);
  }

  const port = url.port ? Number(url.port) : 3306;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    configInvalid([{ field: 'DATABASE_URL', message: '端口无效' }]);
  }

  return {
    host,
    port,
    user: decodeUrlField(url.username, 'DATABASE_URL'),
    password: decodeUrlField(url.password, 'DATABASE_URL'),
    database,
  };
}

function parseCaFile(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const candidate = value.replaceAll('\\', '/');
  const normalized = posix.normalize(candidate);
  if (
    candidate.includes('\0') ||
    win32.isAbsolute(value) ||
    posix.isAbsolute(candidate) ||
    /^[a-z]:/i.test(value) ||
    normalized === '..' ||
    normalized.startsWith('../')
  ) {
    configInvalid([{
      field: 'DATABASE_TLS_CA_FILE',
      message: '必须是仓库根目录内的相对路径',
    }]);
  }

  return normalized.replace(/^\.\//, '');
}

/** Reject obvious placeholders and low-entropy secrets (all environments). */
export function isWeakSecret(value: string): boolean {
  if (value.length < 32) {
    return true;
  }
  if (/^(.)\1+$/.test(value)) {
    return true;
  }
  const lower = value.toLowerCase();
  const needles = [
    'change-me',
    'changeme',
    'password',
    'placeholder',
    'your-secret',
    'replace-with',
    'example',
    'test-secret',
    'admin123',
    'session-secret',
    'secret-string',
  ];
  if (needles.some((needle) => lower.includes(needle))) {
    return true;
  }
  // "secret" as a long repeated word block
  if (/^(secret)+$/i.test(value) || /^(password)+$/i.test(value)) {
    return true;
  }
  return false;
}

function parseKeyring(raw: string, currentKeyId: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    configInvalid([{
      field: 'APP_ENCRYPTION_KEYRING',
      message: '必须是 JSON 对象',
    }]);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    configInvalid([{
      field: 'APP_ENCRYPTION_KEYRING',
      message: '必须是非空 JSON 对象',
    }]);
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    configInvalid([{
      field: 'APP_ENCRYPTION_KEYRING',
      message: '必须至少包含一个密钥',
    }]);
  }

  const vault = new Map<string, Uint8Array>();
  for (const [keyId, encoded] of entries) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId) || typeof encoded !== 'string') {
      configInvalid([{
        field: 'APP_ENCRYPTION_KEYRING',
        message: '密钥 ID 或密钥格式无效',
      }]);
    }

    const decoded = Buffer.from(encoded, 'base64');
    if (
      decoded.byteLength !== 32 ||
      decoded.toString('base64') !== encoded
    ) {
      configInvalid([{
        field: 'APP_ENCRYPTION_KEYRING',
        message: '密钥必须是规范 Base64 编码的 32 字节值',
      }]);
    }
    if (decoded.every((byte) => byte === 0)) {
      configInvalid([{
        field: 'APP_ENCRYPTION_KEYRING',
        message: '密钥不能是全零材料',
      }]);
    }
    vault.set(keyId, new Uint8Array(decoded));
  }

  if (!vault.has(currentKeyId)) {
    configInvalid([{
      field: 'APP_ENCRYPTION_CURRENT_KEY_ID',
      message: '当前密钥 ID 必须存在于 keyring',
    }]);
  }

  // Accessors always return a copy so callers cannot mutate vault material.
  const keys: Record<string, Uint8Array> = {};
  for (const keyId of vault.keys()) {
    Object.defineProperty(keys, keyId, {
      enumerable: true,
      configurable: false,
      get() {
        const material = vault.get(keyId);
        return material ? new Uint8Array(material) : new Uint8Array();
      },
    });
  }

  return Object.freeze(keys);
}

/** Secrets used only for log redaction — never log this list. */
export function collectRedactionSecrets(config: AppConfig): readonly string[] {
  const secrets = [
    config.sessionSecret,
    config.database.password,
    config.database.user,
  ];
  for (const keyId of Object.keys(config.encryption.keys)) {
    secrets.push(Buffer.from(config.encryption.keys[keyId]).toString('base64'));
  }
  return secrets.filter((value) => value.length > 0);
}

const databaseEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  // Unset → disabled for catalog/runtime pool (legacy remote MySQL without CA).
  // Full parseConfig still defaults to required when SESSION/encryption are loaded.
  DATABASE_TLS_MODE: z.enum(['required', 'disabled']).default('disabled'),
  DATABASE_TLS_CA_FILE: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().min(1).optional(),
  ),
  DATABASE_POOL_CONNECTION_LIMIT: integerEnvironment(
    'DATABASE_POOL_CONNECTION_LIMIT',
    8,
    1,
    100,
  ),
  DATABASE_POOL_MAX_IDLE: integerEnvironment(
    'DATABASE_POOL_MAX_IDLE',
    4,
    0,
    100,
  ),
  DATABASE_POOL_IDLE_TIMEOUT_MS: integerEnvironment(
    'DATABASE_POOL_IDLE_TIMEOUT_MS',
    30_000,
    1,
    3_600_000,
  ),
  DATABASE_CONNECT_TIMEOUT_MS: integerEnvironment(
    'DATABASE_CONNECT_TIMEOUT_MS',
    20_000,
    1,
    300_000,
  ),
});

/**
 * Database-only config for lib/db pool. Does not require SESSION_SECRET or
 * encryption keyring so public catalog pages can load with DATABASE_URL alone.
 */
export function parseDatabaseConfig(environment: EnvironmentSource): DatabaseConfig {
  const parsed = databaseEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    configInvalid(parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'environment',
      message: '配置值无效',
    })));
  }

  const env = parsed.data;
  const databaseUrl = parseDatabaseUrl(env.DATABASE_URL);
  const caFile = parseCaFile(env.DATABASE_TLS_CA_FILE);

  if (env.DATABASE_TLS_MODE === 'disabled') {
    // Catalog pool: allow remote without TLS only outside production.
    if (env.NODE_ENV === 'production' && !isLoopbackHost(databaseUrl.host)) {
      configInvalid([{
        field: 'DATABASE_TLS_MODE',
        message: '生产远程数据库必须启用 TLS（DATABASE_TLS_MODE=required）',
      }]);
    }
    if (caFile) {
      configInvalid([{
        field: 'DATABASE_TLS_CA_FILE',
        message: 'TLS disabled 时不能配置 CA 文件',
      }]);
    }
  }

  if (env.DATABASE_POOL_MAX_IDLE > env.DATABASE_POOL_CONNECTION_LIMIT) {
    configInvalid([{
      field: 'DATABASE_POOL_MAX_IDLE',
      message: '不能超过连接池上限',
    }]);
  }

  return Object.freeze({
    ...databaseUrl,
    tls: Object.freeze({
      mode: env.DATABASE_TLS_MODE,
      ...(caFile ? { caFile } : {}),
    }),
    pool: Object.freeze({
      connectionLimit: env.DATABASE_POOL_CONNECTION_LIMIT,
      maxIdle: env.DATABASE_POOL_MAX_IDLE,
      idleTimeoutMs: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      connectTimeoutMs: env.DATABASE_CONNECT_TIMEOUT_MS,
    }),
  });
}

export function parseConfig(environment: EnvironmentSource): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    configInvalid(parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'environment',
      message: '配置值无效',
    })));
  }

  const env = parsed.data;
  const databaseUrl = parseDatabaseUrl(env.DATABASE_URL);
  const caFile = parseCaFile(env.DATABASE_TLS_CA_FILE);

  if (isWeakSecret(env.SESSION_SECRET)) {
    configInvalid([{
      field: 'SESSION_SECRET',
      message: '会话密钥强度不足或使用了占位值',
    }]);
  }

  if (env.DATABASE_TLS_MODE === 'disabled') {
    if (env.NODE_ENV === 'production' || !isLoopbackHost(databaseUrl.host)) {
      configInvalid([{
        field: 'DATABASE_TLS_MODE',
        message: '仅允许非生产回环数据库禁用 TLS',
      }]);
    }
    if (caFile) {
      configInvalid([{
        field: 'DATABASE_TLS_CA_FILE',
        message: 'TLS disabled 时不能配置 CA 文件',
      }]);
    }
  }

  if (env.DATABASE_POOL_MAX_IDLE > env.DATABASE_POOL_CONNECTION_LIMIT) {
    configInvalid([{
      field: 'DATABASE_POOL_MAX_IDLE',
      message: '不能超过连接池上限',
    }]);
  }

  const keys = parseKeyring(
    env.APP_ENCRYPTION_KEYRING,
    env.APP_ENCRYPTION_CURRENT_KEY_ID,
  );

  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    database: Object.freeze({
      ...databaseUrl,
      tls: Object.freeze({
        mode: env.DATABASE_TLS_MODE,
        ...(caFile ? { caFile } : {}),
      }),
      pool: Object.freeze({
        connectionLimit: env.DATABASE_POOL_CONNECTION_LIMIT,
        maxIdle: env.DATABASE_POOL_MAX_IDLE,
        idleTimeoutMs: env.DATABASE_POOL_IDLE_TIMEOUT_MS,
        connectTimeoutMs: env.DATABASE_CONNECT_TIMEOUT_MS,
      }),
    }),
    sessionSecret: env.SESSION_SECRET,
    encryption: Object.freeze({
      currentKeyId: env.APP_ENCRYPTION_CURRENT_KEY_ID,
      keys,
    }),
  });
}

export function getProcessEnvironment(): EnvironmentSource {
  return process.env;
}
