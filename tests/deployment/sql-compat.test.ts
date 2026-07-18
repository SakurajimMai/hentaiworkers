import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCTION_COLLATION,
  PORTABLE_COLLATION,
  createSqlCompatibilityNormalizer,
  replaceUnsupportedProductionCollation,
} from '../../scripts/lib/sql-compat.mjs';

test('SQL compatibility keeps supported production collation', () => {
  const sql = `COLLATE=${PRODUCTION_COLLATION}`;
  assert.equal(replaceUnsupportedProductionCollation(sql, true), sql);
});

test('SQL compatibility falls back without changing unrelated SQL', () => {
  const sql = `CREATE TABLE x (name TEXT) COLLATE=${PRODUCTION_COLLATION};`;
  assert.equal(
    replaceUnsupportedProductionCollation(sql, false),
    `CREATE TABLE x (name TEXT) COLLATE=${PORTABLE_COLLATION};`,
  );
});

test('database collation detection controls migration execution', async () => {
  const warnings: string[] = [];
  const connection = {
    async query(): Promise<[unknown[], unknown]> {
      return [[], []];
    },
  };
  const normalize = await createSqlCompatibilityNormalizer(
    connection,
    { warn: (value: string) => warnings.push(value) },
  );
  assert.equal(normalize(PRODUCTION_COLLATION), PORTABLE_COLLATION);
  assert.equal(warnings.length, 1);
});
