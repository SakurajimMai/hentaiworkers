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

test('公开标签只来自关联当前有效里番的去重关系', () => {
  const adapter = readFileSync(
    'lib/server/infrastructure/database/mariadb-catalog-repository.ts',
    'utf8',
  );
  const listTags = adapter.slice(
    adapter.indexOf('listTags(): Promise<ReadonlyArray<TagSummary>>'),
    adapter.indexOf('getSitemapData(): Promise<SitemapData>'),
  );

  assert.match(listTags, /selectDistinct/);
  assert.match(listTags, /innerJoin\(animeTags/);
  assert.match(listTags, /innerJoin\(animes/);
  assert.match(listTags, /where\(activeAnimeCondition\(\)\)/);
});
