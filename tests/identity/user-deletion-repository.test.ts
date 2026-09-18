import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

test('user deletion commits complete cleanup, protects admins and rolls back failures', async () => {
  const bundle = await build({
    entryPoints: ['lib/server/infrastructure/database/mariadb-user-repository.ts'],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{
      name: 'database-fixture',
      setup(api) {
        api.onResolve({ filter: /^@\/lib\/db$/ }, () => ({ path: 'db', namespace: 'fixture' }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export const pool = fixture.pool; export const db = {}; export const withDbRetry = fn => fn();',
        }));
      },
    }],
  });
  for (const mode of ['ordinary', 'protected', 'failure'] as const) {
    const calls: string[] = [];
    const connection = {
      async beginTransaction() { calls.push('begin'); },
      async query(sql: string, values: unknown[]) {
        calls.push(sql);
        assert.equal(values[0], 42);
        if (sql.startsWith('SELECT')) {
          assert.deepEqual(values, [42, 'user']);
          assert.match(sql, /FOR UPDATE/);
          return [mode === 'protected' ? [] : [{ id: 42 }]];
        }
        if (mode === 'failure' && sql.includes('manga_favorites')) throw new Error('storage unavailable');
        return [{}];
      },
      async commit() { calls.push('commit'); },
      async rollback() { calls.push('rollback'); },
      release() { calls.push('release'); },
    };
    const bundledModule = { exports: {} as { MariaDbUserRepository: new () => { deleteRegularUser(id: number): Promise<boolean> } } };
    new Function('module', 'exports', 'require', 'fixture', bundle.outputFiles[0].text)(
      bundledModule, bundledModule.exports, createRequire(import.meta.url), { pool: { getConnection: async () => connection } },
    );
    const repository = new bundledModule.exports.MariaDbUserRepository();
    if (mode === 'failure') {
      await assert.rejects(() => repository.deleteRegularUser(42), /storage unavailable/);
      assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
      assert.ok(!calls.some((sql) => sql === 'DELETE FROM users WHERE id = ?'));
    } else {
      assert.equal(await repository.deleteRegularUser(42), mode === 'ordinary');
      if (mode === 'protected') {
        assert.ok(!calls.some((sql) => sql.startsWith('DELETE')));
        assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
      } else {
        for (const table of ['user_list_items', 'user_lists', 'user_favorites', 'user_watch_progress', 'user_events', 'manga_favorites', 'manga_reading_progress', 'email_verification_tokens', 'password_reset_tokens']) {
          assert.ok(calls.some((sql) => sql.includes(table)), `must clean ${table}`);
        }
        assert.deepEqual(calls.slice(-3), ['DELETE FROM users WHERE id = ?', 'commit', 'release']);
      }
    }
  }
});
