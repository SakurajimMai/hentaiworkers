import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CONNECTION_TIMEOUT_MS,
  CORE_TABLES,
  QUERY_TIMEOUT_MS,
  buildDatabaseConnectionSettings,
  buildShowCreateTableQuery,
  extractCreateTable,
  loadDatabaseConnectionSettings,
  normalizeCreateTable,
  readCreateTables,
  writeBaselineAtomically,
} from '../scripts/export-schema-baseline.mjs';

type QueryOptions = {
  sql: string;
  timeout: number;
};

test('导出器只允许固定核心表名', () => {
  assert.deepEqual(CORE_TABLES, ['animes', 'tags', 'anime_tags', 'categories', 'users']);
  assert.equal(buildShowCreateTableQuery('anime_tags'), 'SHOW CREATE TABLE `anime_tags`');
  assert.throws(
    () => buildShowCreateTableQuery('animes`; DROP TABLE users; --'),
    /不允许导出表/,
  );
});

test('导出器兼容 MariaDB 列名并规范化易变表选项', () => {
  const createTable = extractCreateTable(
    {
      Table: 'animes',
      'CREATE TABLE': 'CREATE TABLE `animes` (\r\n  `id` bigint NOT NULL\r\n) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4',
    },
    'animes',
  );

  assert.equal(
    normalizeCreateTable(createTable),
    'CREATE TABLE `animes` (\n  `id` bigint NOT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
  );
});

test('远程数据库默认强制 TLS 证书和主机名校验', () => {
  const settings = buildDatabaseConnectionSettings(
    { DATABASE_URL: 'mysql://user:secret@database.example:3306/anime' },
    'C:/repository',
  );

  assert.equal(settings.tlsRequired, true);
  assert.equal(settings.connectionOptions.host, 'database.example');
  assert.equal(settings.connectionOptions.port, 3306);
  assert.equal(settings.connectionOptions.user, 'user');
  assert.equal(settings.connectionOptions.password, 'secret');
  assert.equal(settings.connectionOptions.database, 'anime');
  assert.equal(settings.connectionOptions.connectTimeout, CONNECTION_TIMEOUT_MS);
  assert.deepEqual(settings.connectionOptions.ssl, {
    rejectUnauthorized: true,
    verifyIdentity: true,
    minVersion: 'TLSv1.2',
  });
});

test('TLS required 拒绝非回环 IP 字面地址', () => {
  for (const host of ['203.0.113.10', '[2001:db8::10]', '[::ffff:203.0.113.10]']) {
    assert.throws(
      () => buildDatabaseConnectionSettings({
        DATABASE_URL: `mysql://user:secret@${host}:3306/anime`,
      }),
      /远程数据库必须使用证书匹配的 DNS 主机名/,
    );
  }
});

test('TLS 只能在本地地址显式禁用', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const settings = buildDatabaseConnectionSettings({
      DATABASE_URL: `mysql://user:secret@${host}:3306/anime`,
      DATABASE_TLS_MODE: 'disabled',
    });
    assert.equal(settings.tlsRequired, false);
    assert.equal(settings.connectionOptions.ssl, undefined);
  }

  assert.throws(
    () => buildDatabaseConnectionSettings({
      DATABASE_URL: 'mysql://user:secret@database.example:3306/anime',
      DATABASE_TLS_MODE: 'disabled',
    }),
    /仅允许本地数据库禁用 TLS/,
  );
  assert.throws(
    () => buildDatabaseConnectionSettings({
      DATABASE_URL: 'mysql://user:secret@database.example:3306/anime',
      DATABASE_TLS_MODE: 'optional',
    }),
    /DATABASE_TLS_MODE/,
  );
});

test('数据库 URL 仅解码白名单连接字段', () => {
  const settings = buildDatabaseConnectionSettings({
    DATABASE_URL: 'mysql://user%40name:p%40ss%3Aword@database.example:3307/anime%20catalog',
  });
  const options = settings.connectionOptions;

  assert.equal(options.host, 'database.example');
  assert.equal(options.port, 3307);
  assert.equal(options.user, 'user@name');
  assert.equal(options.password, 'p@ss:word');
  assert.equal(options.database, 'anime catalog');
  assert.equal(Object.hasOwn(options, 'uri'), false);
  assert.equal(Object.hasOwn(options, 'multipleStatements'), false);
  assert.equal(Object.hasOwn(options, 'debug'), false);
  assert.deepEqual(
    Object.keys(options).sort(),
    ['connectTimeout', 'database', 'host', 'password', 'port', 'ssl', 'user'].sort(),
  );
});

test('数据库 URL 拒绝查询参数和片段', () => {
  for (const suffix of ['?multipleStatements=true', '?debug=true', '#debug']) {
    assert.throws(
      () => buildDatabaseConnectionSettings({
        DATABASE_URL: `mysql://user:secret@database.example:3306/anime${suffix}`,
      }),
      /不允许查询参数或片段/,
    );
  }
});

test('可选 CA 文件必须从仓库根目录内相对读取', () => {
  const root = mkdtempSync(join(tmpdir(), 'anime-baseline-ca-'));
  try {
    mkdirSync(join(root, 'certificates'));
    writeFileSync(join(root, 'certificates', 'database-ca.pem'), 'TEST CA\n', 'utf8');

    const settings = buildDatabaseConnectionSettings(
      {
        DATABASE_URL: 'mysql://user:secret@database.example:3306/anime',
        DATABASE_TLS_CA_FILE: 'certificates/database-ca.pem',
      },
      root,
    );
    const ssl = settings.connectionOptions.ssl;
    assert.ok(ssl && typeof ssl !== 'string');
    assert.equal(ssl.ca, 'TEST CA\n');

    assert.throws(
      () => buildDatabaseConnectionSettings(
        {
          DATABASE_URL: 'mysql://user:secret@database.example:3306/anime',
          DATABASE_TLS_CA_FILE: '../outside.pem',
        },
        root,
      ),
      /仓库根目录内的相对路径/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dotenv 加载后显式环境变量仍优先', () => {
  const explicitUrl = 'mysql://user:secret@explicit.example:3306/anime';
  const environment = { DATABASE_URL: explicitUrl };
  const settings = loadDatabaseConnectionSettings({
    environment,
    repositoryDirectory: 'C:/repository',
    loadEnvironment: ({ processEnv }) => {
      processEnv.DATABASE_URL ??= 'mysql://user:secret@file.example:3306/anime';
    },
  });

  assert.equal(settings.connectionOptions.host, 'explicit.example');
});

test('远程连接先验证 TLS 会话再执行带超时的 DDL 查询', async () => {
  const queries: QueryOptions[] = [];
  const connection = {
    async query(options: QueryOptions) {
      queries.push(options);
      if (options.sql === "SHOW SESSION STATUS LIKE 'Ssl_cipher'") {
        return [[{ Variable_name: 'Ssl_cipher', Value: 'TLS_AES_256_GCM_SHA384' }]];
      }
      const tableName = options.sql.match(/`([^`]+)`/)?.[1];
      return [[{ 'Create Table': `CREATE TABLE \`${tableName}\` (\`id\` bigint)` }]];
    },
  };

  const createTables = await readCreateTables(connection, {
    tlsRequired: true,
    logTable: () => {},
  });

  assert.deepEqual([...createTables.keys()], CORE_TABLES);
  assert.equal(queries[0].sql, "SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  assert.equal(queries.length, CORE_TABLES.length + 1);
  for (const query of queries) {
    assert.equal(query.timeout, QUERY_TIMEOUT_MS);
  }
});

test('TLS 会话验证失败时不执行任何 DDL 查询', async () => {
  const queries: QueryOptions[] = [];
  const connection = {
    async query(options: QueryOptions) {
      queries.push(options);
      return [[{ Variable_name: 'Ssl_cipher', Value: '' }]];
    },
  };

  await assert.rejects(
    () => readCreateTables(connection, { logTable: () => {} }),
    /TLS 会话验证失败/,
  );
  assert.deepEqual(
    queries.map((query) => query.sql),
    ["SHOW SESSION STATUS LIKE 'Ssl_cipher'"],
  );
});

test('基线使用同目录临时文件原子替换并清理临时文件', async () => {
  const root = mkdtempSync(join(tmpdir(), 'anime-baseline-write-'));
  const outputPath = join(root, 'baseline.sql');
  try {
    writeFileSync(outputPath, 'old\n', 'utf8');
    await writeBaselineAtomically(outputPath, 'new\n');

    assert.equal(readFileSync(outputPath, 'utf8'), 'new\n');
    assert.deepEqual(readdirSync(root), ['baseline.sql']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('生产基线包含现有核心表和约束', () => {
  const sql = readFileSync('drizzle/baseline/0000-production-schema.sql', 'utf8');
  const executableSql = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '');
  const tableDeclarations = [...executableSql.matchAll(/^CREATE TABLE `([^`]+)`/gm)];

  assert.equal(tableDeclarations.length, 5);
  assert.deepEqual(
    tableDeclarations.map((match) => match[1]),
    CORE_TABLES,
  );

  const animeTagsStart = executableSql.indexOf('CREATE TABLE `anime_tags`');
  const categoriesStart = executableSql.indexOf('CREATE TABLE `categories`');
  const animeTagsSql = executableSql.slice(animeTagsStart, categoriesStart);
  assert.ok(animeTagsStart >= 0 && categoriesStart > animeTagsStart);
  assert.match(
    animeTagsSql,
    /UNIQUE(?: KEY| INDEX)?[^\n(]*\(\s*`anime_id`\s*,\s*`tag_id`\s*\)/i,
  );
  assert.match(animeTagsSql, /FOREIGN KEY\s*\(\s*`anime_id`\s*\)/i);
  assert.match(animeTagsSql, /FOREIGN KEY\s*\(\s*`tag_id`\s*\)/i);

  assert.doesNotMatch(
    executableSql,
    /^\s*(?:INSERT|REPLACE|LOAD\s+DATA|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/gmi,
  );
  assert.doesNotMatch(executableSql, /^\s*\)[^;\n]*\bAUTO_INCREMENT\s*=\s*\d+/gmi);
  assert.doesNotMatch(executableSql, /[a-z][a-z0-9+.-]*:\/\//i);
  assert.doesNotMatch(
    executableSql,
    /DATABASE_URL|MYSQL_PASSWORD|DB_PASSWORD|-----BEGIN [^-]*PRIVATE KEY-----/i,
  );
});
