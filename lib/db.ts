import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';
import {
  getProcessEnvironment,
  parseDatabaseConfig,
  type DatabaseConfig,
} from './server/shared/config';

const globalForDb = globalThis as unknown as {
  pool: mysql.Pool | undefined;
  db: MySql2Database<typeof schema> | undefined;
  databaseConfig: DatabaseConfig | undefined;
};

function isOutsideDirectory(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(rootPath, candidatePath);
  return (
    relativePath === '..'
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
  );
}

function readCaFile(caFile: string): string {
  const rootPath = realpathSync(process.cwd());
  if (isAbsolute(caFile)) {
    throw new Error('DATABASE_TLS_CA_FILE 必须是仓库根目录内的相对路径');
  }
  const unresolved = resolve(rootPath, caFile);
  if (isOutsideDirectory(rootPath, unresolved)) {
    throw new Error('DATABASE_TLS_CA_FILE 必须是仓库根目录内的相对路径');
  }
  const caPath = realpathSync(unresolved);
  if (isOutsideDirectory(rootPath, caPath)) {
    throw new Error('DATABASE_TLS_CA_FILE 必须是仓库根目录内的相对路径');
  }
  return readFileSync(caPath, 'utf8');
}

function resolveDatabaseConfig(): DatabaseConfig {
  if (!globalForDb.databaseConfig) {
    globalForDb.databaseConfig = parseDatabaseConfig(getProcessEnvironment());
  }
  return globalForDb.databaseConfig;
}

function createPool(): mysql.Pool {
  const database = resolveDatabaseConfig();

  const options: mysql.PoolOptions = {
    host: database.host,
    port: database.port,
    user: database.user,
    password: database.password,
    database: database.database,
    waitForConnections: true,
    connectionLimit: database.pool.connectionLimit,
    maxIdle: database.pool.maxIdle,
    idleTimeout: database.pool.idleTimeoutMs,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5_000,
    connectTimeout: database.pool.connectTimeoutMs,
    timezone: 'Z',
    dateStrings: true,
  };

  if (database.tls.mode === 'required') {
    options.ssl = {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      ...(database.tls.caFile ? { ca: readCaFile(database.tls.caFile) } : {}),
    };
  }

  return mysql.createPool(options);
}

function getPool(): mysql.Pool {
  if (!globalForDb.pool) {
    globalForDb.pool = createPool();
  }
  return globalForDb.pool;
}

function getDb(): MySql2Database<typeof schema> {
  if (!globalForDb.db) {
    globalForDb.db = drizzle(getPool(), { schema, mode: 'default' });
  }
  return globalForDb.db;
}

/** Lazy pool accessor — does not connect until first use. */
export const pool: mysql.Pool = new Proxy({} as mysql.Pool, {
  get(_target, property, receiver) {
    const value = Reflect.get(getPool(), property, receiver);
    return typeof value === 'function' ? value.bind(getPool()) : value;
  },
});

/** Lazy drizzle accessor — import-safe until first query. */
export const db: MySql2Database<typeof schema> = new Proxy(
  {} as MySql2Database<typeof schema>,
  {
    get(_target, property, receiver) {
      const value = Reflect.get(getDb(), property, receiver);
      return typeof value === 'function' ? value.bind(getDb()) : value;
    },
  },
);

/** Test hook: clear cached pool/config between tests if needed. */
export function resetDbForTests(): void {
  globalForDb.pool = undefined;
  globalForDb.db = undefined;
  globalForDb.databaseConfig = undefined;
}

/** Retry transient MySQL/network failures. */
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      const causeCode =
        e && typeof e === 'object' && 'cause' in e
          ? String((e as { cause?: { code?: string } }).cause?.code || '')
          : '';
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code?: string }).code || '')
          : '';
      const transient =
        [causeCode, code].some((c) =>
          ['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ECONNREFUSED', 'ER_LOCK_DEADLOCK'].includes(
            c,
          ),
        )
        || msg.includes('ECONNRESET')
        || msg.includes('Connection lost')
        || msg.includes('Failed query');

      if (!transient || i === retries) throw e;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw last;
}

/** Keep count + page reads on one repeatable snapshot without blocking writers. */
export function withConsistentRead<T>(
  fn: (connection: mysql.PoolConnection) => Promise<T>,
): Promise<T> {
  return withDbRetry(async () => {
    const connection = await pool.getConnection();
    try {
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query('START TRANSACTION READ ONLY');
      const value = await fn(connection);
      await connection.commit();
      return value;
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original query failure.
      }
      throw error;
    } finally {
      connection.release();
    }
  });
}
