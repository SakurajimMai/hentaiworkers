import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  APP_ERROR_CODES,
  AppError,
  type AppErrorCode,
} from '../../lib/server/shared/errors';
import { err, ok, type Result } from '../../lib/server/shared/result';
import { SystemClock, type Clock } from '../../lib/server/shared/clock';
import {
  createLogger,
  redact,
  type LogRecord,
  type Logger,
} from '../../lib/server/shared/logger';
import {
  parseConfig,
  type AppConfig,
  type EnvironmentSource,
} from '../../lib/server/shared/config';
import {
  container,
  createContainer,
} from '../../lib/server/composition/container';

const ERROR_CODES = [
  'CONFIG_INVALID',
  'SOURCE_RATE_LIMITED',
  'SECRET_REVOKED',
  'RESULT_INVALID',
  'RESULT_CONFLICT',
  'AUTH_REQUIRED',
  'INTERNAL_ERROR',
] as const satisfies readonly AppErrorCode[];

const PRIMARY_KEY = Buffer.alloc(32, 7).toString('base64');
const PREVIOUS_KEY = Buffer.alloc(32, 11).toString('base64');
const STRONG_SESSION_SECRET = 'xK9mP2vL8nQ4wR7tY1uI0oP3aS6dF9gH12';

function validEnvironment(
  overrides: Record<string, string | undefined> = {},
): EnvironmentSource {
  const environment: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    DATABASE_URL: 'mysql://user%40name:p%40ss%3Aword@database.example:3307/anime%20catalog',
    DATABASE_TLS_MODE: 'required',
    DATABASE_POOL_CONNECTION_LIMIT: '12',
    DATABASE_POOL_MAX_IDLE: '6',
    DATABASE_POOL_IDLE_TIMEOUT_MS: '45000',
    DATABASE_CONNECT_TIMEOUT_MS: '15000',
    SESSION_SECRET: STRONG_SESSION_SECRET,
    APP_ENCRYPTION_KEYRING: JSON.stringify({
      primary: PRIMARY_KEY,
      previous: PREVIOUS_KEY,
    }),
    APP_ENCRYPTION_CURRENT_KEY_ID: 'primary',
    ...overrides,
  };

  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) {
      delete environment[key];
    }
  }

  return environment;
}

function captureConfigError(environment: EnvironmentSource): AppError {
  try {
    parseConfig(environment);
  } catch (error) {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'CONFIG_INVALID');
    return error;
  }
  assert.fail('预期配置解析失败');
}

test('AppError 使用正式规格中的完整稳定错误码并保留安全元数据', () => {
  assert.deepEqual(APP_ERROR_CODES, ERROR_CODES);

  const error = new AppError(
    'INTERNAL_ERROR',
    '数据库暂时不可用',
    503,
    true,
    { requestId: 'request-1' },
  );

  assert.equal(error.name, 'AppError');
  assert.equal(error.code, 'INTERNAL_ERROR');
  assert.equal(error.status, 503);
  assert.equal(error.retryable, true);
  assert.deepEqual(error.details, { requestId: 'request-1' });
  assert.equal('cause' in error, false);
  assert.doesNotMatch(JSON.stringify(error), /driver-secret/);
});

test('Result 使用可辨识联合表达成功和失败', () => {
  const success: Result<number, AppError> = ok(42);
  const failure: Result<number, AppError> = err(
    new AppError('RESULT_INVALID', '结果无效', 422),
  );

  assert.deepEqual(success, { ok: true, value: 42 });
  assert.equal(failure.ok, false);
  if (!failure.ok) {
    assert.equal(failure.error.code, 'RESULT_INVALID');
  }
});

test('SystemClock 返回可表示为 UTC 的当前时间', () => {
  const clock: Clock = new SystemClock();
  const before = Date.now();
  const now = clock.now();
  const after = Date.now();

  assert.ok(now instanceof Date);
  assert.ok(now.getTime() >= before && now.getTime() <= after);
  assert.match(now.toISOString(), /Z$/);
});

test('递归 redactor 纯化处理敏感键、URL、Bearer、Error、循环与二进制', () => {
  const explicitSecret = 'EXPLICIT-SECRET-VALUE';
  const bearerToken = 'header.payload.signature';
  const circular: Record<string, unknown> = { label: 'safe' };
  circular.self = circular;
  const cause = new Error(`cause ${explicitSecret}`);
  const error = new Error(`failure ${explicitSecret}`, { cause });
  Object.assign(error, {
    query: 'SELECT * FROM users',
    credential: explicitSecret,
  });
  const input = {
    authorization: `Bearer ${bearerToken}`,
    Cookie: 'session=raw-cookie',
    userPassword: 'raw-password',
    clientSecret: 'raw-client-secret',
    refreshToken: 'raw-refresh-token',
    apiKey: 'raw-api-key',
    accessKeyId: 'raw-access-key',
    privateKey: 'raw-private-key',
    credential: 'raw-credential',
    DATABASE_URL: 'mysql://db-user:db-password@database.example/anime',
    sql: 'DELETE FROM users',
    query: 'SELECT secret FROM users',
    statement: 'UPDATE users SET password = 1',
    nested: {
      message: `Bearer ${bearerToken} ${explicitSecret}`,
      url: new URL('https://url-user:url-password@example.com/path?token=url-token&safe=ok'),
      error,
      binary: Buffer.from(explicitSecret),
      bytes: new Uint8Array([1, 2, 3]),
      circular,
    },
  };

  const redacted = redact(input, { secrets: [explicitSecret] });
  const serialized = JSON.stringify(redacted);

  for (const secret of [
    bearerToken,
    explicitSecret,
    'raw-cookie',
    'raw-password',
    'raw-client-secret',
    'raw-refresh-token',
    'raw-api-key',
    'raw-access-key',
    'raw-private-key',
    'raw-credential',
    'db-user',
    'db-password',
    'url-user',
    'url-password',
    'url-token',
    'DELETE FROM users',
    'SELECT secret FROM users',
    'UPDATE users SET password = 1',
  ]) {
    assert.equal(serialized.includes(secret), false, `不应输出敏感值：${secret}`);
  }

  assert.match(serialized, /\[REDACTED\]/);
  assert.match(serialized, /\[Circular\]/);
  assert.match(serialized, /\[Binary 21 bytes\]/);
  assert.equal(input.authorization, `Bearer ${bearerToken}`);
  assert.equal(input.nested.circular, circular);
});

test('logger 合并 child context 并保证 sink 永不收到原密钥', () => {
  const records: LogRecord[] = [];
  const secret = 'LOGGER-SECRET-VALUE';
  const clock: Clock = {
    now: () => new Date('2026-07-13T10:00:00.000Z'),
  };
  const logger = createLogger({
    clock,
    context: { service: 'app', password: 'context-password' },
    secrets: [secret],
    sink: (record) => records.push(record),
  });

  logger
    .child({ requestId: 'request-1', token: 'child-token' })
    .error(`请求失败 Bearer abc.def.ghi ${secret}`, {
      url: 'mysql://logger-user:logger-password@database.example/anime',
      error: new Error(`inner ${secret}`),
    });

  assert.equal(records.length, 1);
  assert.equal(records[0].timestamp, '2026-07-13T10:00:00.000Z');
  assert.equal(records[0].level, 'error');
  assert.equal(records[0].context.service, 'app');
  assert.equal(records[0].context.requestId, 'request-1');

  const serialized = JSON.stringify(records);
  for (const raw of [
    secret,
    'abc.def.ghi',
    'context-password',
    'child-token',
    'logger-user',
    'logger-password',
  ]) {
    assert.equal(serialized.includes(raw), false, `sink 不应收到原值：${raw}`);
  }
});

test('配置解析只返回白名单数据库字段并解析 TLS、连接池和 keyring', () => {
  const config = parseConfig(validEnvironment({
    NODE_ENV: 'production',
    DATABASE_TLS_CA_FILE: 'certificates/database-ca.pem',
  }));

  assert.equal(config.nodeEnv, 'production');
  assert.deepEqual(config.database, {
    host: 'database.example',
    port: 3307,
    user: 'user@name',
    password: 'p@ss:word',
    database: 'anime catalog',
    tls: {
      mode: 'required',
      caFile: 'certificates/database-ca.pem',
    },
    pool: {
      connectionLimit: 12,
      maxIdle: 6,
      idleTimeoutMs: 45000,
      connectTimeoutMs: 15000,
    },
  });
  assert.equal(config.sessionSecret, STRONG_SESSION_SECRET);
  assert.equal(config.encryption.currentKeyId, 'primary');
  assert.deepEqual(
    Buffer.from(config.encryption.keys.primary),
    Buffer.alloc(32, 7),
  );
  assert.deepEqual(
    Object.keys(config.encryption.keys).sort(),
    ['previous', 'primary'],
  );
});

test('redactor 脱敏嵌在普通错误文本中的 URL 查询密钥', () => {
  const token = 'query-token-should-vanish';
  const password = 'query-password-should-vanish';
  const message =
    `上游失败 https://cdn.example.com/item?token=${token}&safe=1&password=${password} 请重试`;

  const redacted = String(redact(message));
  assert.equal(redacted.includes(token), false);
  assert.equal(redacted.includes(password), false);
  assert.match(redacted, /token=\[REDACTED\]/i);
  assert.match(redacted, /password=\[REDACTED\]/i);
  assert.match(redacted, /safe=1/);
});

test('keyring 材料不可被调用方改写', () => {
  const config = parseConfig(validEnvironment());
  const primary = config.encryption.keys.primary;
  const snapshot = Uint8Array.from(primary);
  assert.equal(primary.byteLength, 32);

  primary[0] = (primary[0] + 1) % 256;
  // Local copy may change; vault material behind the accessor must not.
  assert.deepEqual(Uint8Array.from(config.encryption.keys.primary), snapshot);
  assert.deepEqual(
    Buffer.from(config.encryption.keys.primary),
    Buffer.alloc(32, 7),
  );
});

test('生产环境拒绝会话占位密钥与全零 keyring', () => {
  for (const secret of [
    's'.repeat(32),
    'change-me-please-change-me-please!!',
    'replace-with-a-long-random-secret-string',
    'passwordpasswordpasswordpassword',
  ]) {
    captureConfigError(validEnvironment({
      NODE_ENV: 'production',
      SESSION_SECRET: secret,
    }));
  }

  const zeroKey = Buffer.alloc(32, 0).toString('base64');
  captureConfigError(validEnvironment({
    NODE_ENV: 'production',
    APP_ENCRYPTION_KEYRING: JSON.stringify({ primary: zeroKey }),
    APP_ENCRYPTION_CURRENT_KEY_ID: 'primary',
  }));
});

test('默认 container logger 用配置密钥脱敏且不把密钥写入 sink', () => {
  const records: LogRecord[] = [];
  const service = createContainer({
    env: validEnvironment(),
    clock: { now: () => new Date('2026-07-13T12:00:00.000Z') },
    logSink: (record) => records.push(record),
  });

  service.getLogger().error(
    `session=${STRONG_SESSION_SECRET} key=${PRIMARY_KEY} dbpass=p@ss:word`,
  );

  assert.equal(records.length, 1);
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes(STRONG_SESSION_SECRET), false);
  assert.equal(serialized.includes(PRIMARY_KEY), false);
  assert.equal(serialized.includes('p@ss:word'), false);
  assert.match(serialized, /\[REDACTED\]/);
});

test('logger write 在 sink 或 clock 抛错时不向外抛出', () => {
  const secret = 'LOGGER-THROW-SECRET-VALUE-XXXX';
  const logger = createLogger({
    secrets: [secret],
    clock: {
      now: () => {
        throw new Error(`clock boom ${secret}`);
      },
    },
    sink: () => {
      throw new Error(`sink boom ${secret}`);
    },
  });

  assert.doesNotThrow(() => {
    logger.error(`payload ${secret}`, { password: secret });
  });

  const resilient = createLogger({
    secrets: [secret],
    clock: { now: () => new Date('2026-07-13T00:00:00.000Z') },
    sink: () => {
      throw new Error(`sink only ${secret}`);
    },
  });
  assert.doesNotThrow(() => resilient.info('ok'));
});

test('数据库 URL 拒绝非 mysql、查询参数、片段、额外路径和远程 IP', () => {
  for (const databaseUrl of [
    'postgres://user:password@database.example/anime',
    'mysql://user:password@database.example/anime?multipleStatements=true',
    'mysql://user:password@database.example/anime#debug',
    'mysql://user:password@database.example/anime/extra',
    'mysql://user:password@203.0.113.10/anime',
    'mysql://user:password@[2001:db8::10]/anime',
  ]) {
    captureConfigError(validEnvironment({ DATABASE_URL: databaseUrl }));
  }
});

test('TLS disabled 仅允许非生产回环数据库且不能同时配置 CA', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const config = parseConfig(validEnvironment({
      DATABASE_URL: `mysql://user:password@${host}:3306/anime`,
      DATABASE_TLS_MODE: 'disabled',
    }));
    assert.equal(config.database.tls.mode, 'disabled');
  }

  captureConfigError(validEnvironment({
    DATABASE_TLS_MODE: 'disabled',
  }));
  captureConfigError(validEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL: 'mysql://user:password@localhost:3306/anime',
    DATABASE_TLS_MODE: 'disabled',
  }));
  captureConfigError(validEnvironment({
    DATABASE_URL: 'mysql://user:password@localhost:3306/anime',
    DATABASE_TLS_MODE: 'disabled',
    DATABASE_TLS_CA_FILE: 'certificates/database-ca.pem',
  }));
  captureConfigError(validEnvironment({ DATABASE_TLS_MODE: 'optional' }));
});

test('CA 文件必须是仓库内相对路径，连接池参数必须是合理整数', () => {
  for (const caFile of [
    '../database-ca.pem',
    '/etc/ssl/database-ca.pem',
    'C:\\certificates\\database-ca.pem',
  ]) {
    captureConfigError(validEnvironment({ DATABASE_TLS_CA_FILE: caFile }));
  }

  for (const overrides of [
    { DATABASE_POOL_CONNECTION_LIMIT: '0' },
    { DATABASE_POOL_CONNECTION_LIMIT: '8.5' },
    { DATABASE_POOL_CONNECTION_LIMIT: '8', DATABASE_POOL_MAX_IDLE: '9' },
    { DATABASE_POOL_MAX_IDLE: '-1' },
    { DATABASE_POOL_IDLE_TIMEOUT_MS: '0' },
    { DATABASE_CONNECT_TIMEOUT_MS: 'not-a-number' },
  ]) {
    captureConfigError(validEnvironment(overrides));
  }
});

test('SESSION_SECRET 和 keyring 使用严格安全格式且错误详情不包含原值', () => {
  captureConfigError(validEnvironment({ SESSION_SECRET: 'too-short' }));

  const nonCanonicalValues = [
    PRIMARY_KEY.replace(/=+$/, ''),
    `${PRIMARY_KEY}\n`,
    Buffer.alloc(31, 1).toString('base64'),
    Buffer.alloc(32, 255).toString('base64').replaceAll('/', '_'),
  ];

  for (const rawValue of nonCanonicalValues) {
    const rawKeyring = JSON.stringify({ primary: rawValue });
    const error = captureConfigError(validEnvironment({
      APP_ENCRYPTION_KEYRING: rawKeyring,
    }));
    const serialized = JSON.stringify({
      message: error.message,
      details: error.details,
    });
    assert.equal(serialized.includes(rawValue), false);
    assert.equal(serialized.includes(rawKeyring), false);
  }

  captureConfigError(validEnvironment({
    APP_ENCRYPTION_KEYRING: '[]',
  }));
  captureConfigError(validEnvironment({
    APP_ENCRYPTION_CURRENT_KEY_ID: 'missing',
  }));
});

test('container 的导入和创建不读取环境，getter 惰性且支持 override', () => {
  let environmentReads = 0;
  const throwingEnvironment = new Proxy<EnvironmentSource>({}, {
    get() {
      environmentReads += 1;
      throw new Error('ENVIRONMENT_READ');
    },
  });

  assert.ok(container);
  const lazyContainer = createContainer({ env: throwingEnvironment });
  assert.equal(environmentReads, 0);
  assert.throws(() => lazyContainer.getConfig(), /ENVIRONMENT_READ/);
  assert.ok(environmentReads > 0);

  const config: AppConfig = parseConfig(validEnvironment());
  const clock: Clock = { now: () => new Date('2026-07-13T00:00:00.000Z') };
  const logger: Logger = createLogger({ sink: () => {}, clock });
  const overridden = createContainer({
    env: throwingEnvironment,
    config,
    clock,
    logger,
  });
  const readsBeforeGetters = environmentReads;

  assert.strictEqual(overridden.getConfig(), config);
  assert.strictEqual(overridden.getConfig(), config);
  assert.strictEqual(overridden.getClock(), clock);
  assert.strictEqual(overridden.getClock(), clock);
  assert.strictEqual(overridden.getLogger(), logger);
  assert.strictEqual(overridden.getLogger(), logger);
  assert.equal(environmentReads, readsBeforeGetters);

  const source = readFileSync(
    new URL('../../lib/server/composition/container.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /from ['\"](?:mysql2|drizzle-orm)/);
  assert.doesNotMatch(source, /process\.env/);
});
