import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('作品查询在 MariaDB 适配器中复用兼容 NULL 的有效状态条件', () => {
  const adapter = readFileSync(
    'lib/server/infrastructure/database/mariadb-catalog-repository.ts',
    'utf8',
  );
  const facade = readFileSync('lib/anime-service.ts', 'utf8');

  assert.match(adapter, /function activeAnimeCondition\(\)/);
  assert.match(adapter, /isActive\} = 1 OR \$\{animes\.isActive\} IS NULL/);
  assert.doesNotMatch(adapter, /eq\(animes\.isActive,\s*1\)/);

  // Compatibility facade must not reintroduce raw Drizzle status filters.
  assert.doesNotMatch(facade, /drizzle-orm/);
  assert.match(facade, /getCatalogQueryService/);
});
