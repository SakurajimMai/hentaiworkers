import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDatabaseConnectionSettings } from '../../scripts/lib/migration-connection.mjs';

test('ops database connection requires TLS for remote hosts', () => {
  assert.throws(
    () => buildDatabaseConnectionSettings({
      DATABASE_URL: 'mysql://user:secret@database.example:3306/anime',
      DATABASE_TLS_MODE: 'disabled',
    }, process.cwd()),
    /仅允许本地数据库禁用 TLS/,
  );
});

test('ops database connection permits disabled TLS only for loopback', () => {
  const settings = buildDatabaseConnectionSettings({
    DATABASE_URL: 'mysql://user:secret@127.0.0.1:3306/anime',
    DATABASE_TLS_MODE: 'disabled',
  }, process.cwd());
  assert.equal(settings.tlsRequired, false);
  assert.equal(settings.isLocal, true);
});

test('ops database connection defaults remote hosts to verified TLS', () => {
  const settings = buildDatabaseConnectionSettings({
    DATABASE_URL: 'mysql://user:secret@database.example:3306/anime',
  }, process.cwd());
  assert.equal(settings.tlsRequired, true);
  assert.deepEqual(settings.connectionOptions.ssl, {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  });
});
