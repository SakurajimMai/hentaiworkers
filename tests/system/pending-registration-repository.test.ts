import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import type { PendingRegistrationRepository } from '../../lib/server/system/ports/pending-registration-repository';

test('verification inserts only for a valid locked challenge and rolls back partial completion', async () => {
  const bundle = await build({
    entryPoints: ['lib/server/infrastructure/database/mariadb-pending-registration-repository.ts'],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'database-fixture', setup(api) {
      api.onResolve({ filter: /^@\/lib\/db$/ }, () => ({ path: 'db', namespace: 'fixture' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const pool = fixture.pool;' }));
    } }],
  });
  for (const mode of ['valid', 'missing', 'duplicate', 'delete-failure']) {
    const calls: string[] = [];
    const conn = {
      async beginTransaction() { calls.push('begin'); },
      async query(sql: string, values: unknown[]) {
        calls.push(sql);
        if (sql.startsWith('SELECT')) {
          assert.match(sql, /expires_at > UTC_TIMESTAMP\(\) FOR UPDATE/);
          return [mode === 'missing' ? [] : [{ email: 'test@example.com', password_hash: 'hashed', display_name: 'Test' }]];
        }
        if (sql.startsWith('INSERT INTO users')) {
          assert.deepEqual(values, ['test@example.com', 'hashed', 'Test']);
          assert.match(sql, /'user', 1/);
          if (mode === 'duplicate') throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
          return [{ insertId: 42 }];
        }
        if (mode === 'delete-failure') throw new Error('storage unavailable');
        return [{}];
      },
      async commit() { calls.push('commit'); },
      async rollback() { calls.push('rollback'); },
      release() { calls.push('release'); },
    };
    const mod = { exports: {} as { MariaDbPendingRegistrationRepository: new () => PendingRegistrationRepository } };
    new Function('module', 'exports', 'require', 'fixture', bundle.outputFiles[0].text)(
      mod, mod.exports, createRequire(import.meta.url), { pool: { getConnection: async () => conn } },
    );
    const repo = new mod.exports.MariaDbPendingRegistrationRepository();
    if (mode === 'duplicate' || mode === 'delete-failure') {
      await assert.rejects(() => repo.complete(new Uint8Array(32)));
      assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
      assert.ok(!calls.includes('commit'));
    } else {
      assert.equal(await repo.complete(new Uint8Array(32)), mode === 'valid' ? 42 : null);
      if (mode === 'missing') assert.ok(!calls.some(sql => sql.startsWith('INSERT')));
      else assert.match(calls.at(-3)!, /DELETE FROM pending_registrations/);
      assert.deepEqual(calls.slice(-2), [mode === 'valid' ? 'commit' : 'rollback', 'release']);
    }
  }
});
