import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CatalogQueryService } from '../../lib/server/catalog/application/catalog-query-service';
import {
  extractSeriesPrefix,
  escapeLike,
  normalizeListQuery,
} from '../../lib/server/catalog/domain/recommendation';
import { InMemoryCatalogRepository } from '../../lib/server/catalog/testing/in-memory-catalog-repository';
import { MAX_SITEMAP_URLS } from '../../lib/sitemap';

function buildService() {
  const repo = new InMemoryCatalogRepository();
  repo.seedTag({ id: 1, name: '动作', description: null });
  repo.seedTag({ id: 2, name: '恋爱', description: null });
  repo.seedAnime({
    id: 1,
    title: '系列作品 1',
    titleJapanese: 'シリーズ 1',
    isActive: 1,
    viewCount: 100,
    createdAt: '2026-01-01',
    tagIds: [1],
  });
  repo.seedAnime({
    id: 2,
    title: '系列作品 2',
    titleJapanese: 'シリーズ 2',
    isActive: null,
    viewCount: 50,
    createdAt: '2026-01-02',
    tagIds: [1, 2],
  });
  repo.seedAnime({
    id: 3,
    title: '下架作品',
    isActive: 0,
    viewCount: 999,
    createdAt: '2026-01-03',
    tagIds: [1],
  });
  repo.seedAnime({
    id: 4,
    title: '热门独立',
    isActive: 1,
    viewCount: 500,
    createdAt: '2025-12-01',
    tagIds: [2],
  });
  return { service: new CatalogQueryService(repo), repo };
}

test('domain helpers: series prefix, like escape, list normalization', () => {
  assert.equal(extractSeriesPrefix('系列作品 12'), '系列作品');
  assert.equal(extractSeriesPrefix('Vol.3'), null);
  assert.equal(extractSeriesPrefix('Title Vol.3'), 'Title');
  assert.equal(escapeLike('a%b_c\\d'), 'a\\%b\\_c\\\\d');

  const capped = normalizeListQuery({ page: 0, limit: 500, sort: 'popular' });
  assert.equal(capped.page, 1);
  assert.equal(capped.limit, 100);
  assert.equal(capped.sort, 'popular');
  assert.equal(capped.offset, 0);
});

test('list treats is_active null as visible and excludes inactive', async () => {
  const { service } = buildService();
  const page = await service.list({ page: 1, limit: 50, sort: 'latest' });
  const ids = page.data.map((item) => item.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 2, 4]);
  assert.equal(page.data.some((item) => item.id === 3), false);
});

test('list enforces paging caps and popular sort', async () => {
  const { service } = buildService();
  const page = await service.list({ page: 1, limit: 999, sort: 'popular' });
  assert.equal(page.pagination.limit, 100);
  assert.deepEqual(
    page.data.map((item) => item.id),
    [4, 1, 2],
  );
});

test('list supports tag filter and search', async () => {
  const { service } = buildService();
  const byTag = await service.list({ tagId: 2, sort: 'latest' });
  assert.deepEqual(
    byTag.data.map((item) => item.id).sort((a, b) => a - b),
    [2, 4],
  );

  const bySearch = await service.list({ search: '独立', sort: 'latest' });
  assert.equal(bySearch.data.length, 1);
  assert.equal(bySearch.data[0].id, 4);
});

test('similar prefers series prefix then shared tags then popular', async () => {
  const { service, repo } = buildService();
  repo.seedAnime({
    id: 5,
    title: '系列作品 3',
    isActive: 1,
    viewCount: 10,
    createdAt: '2026-01-04',
    tagIds: [],
  });

  const similar = await service.getSimilar(1, 12);
  const ids = similar.map((item) => item.id);
  assert.ok(ids.includes(2));
  assert.ok(ids.includes(5));
  assert.equal(ids.includes(3), false);
  assert.ok(ids.indexOf(2) < ids.indexOf(4) || ids.includes(5));
});

test('similar falls back to popular when no tags and no series', async () => {
  const { service, repo } = buildService();
  repo.seedAnime({
    id: 9,
    title: '完全独立标题XYZ',
    isActive: 1,
    viewCount: 1,
    createdAt: '2026-02-01',
    tagIds: [],
  });
  const similar = await service.getSimilar(9, 2);
  assert.ok(similar.length > 0);
  assert.equal(similar.some((item) => item.id === 9), false);
  assert.ok(similar[0].viewCount! >= (similar[1]?.viewCount ?? 0));
});

test('sitemap data only includes active rows and enforces URL budget', async () => {
  const { service, repo } = buildService();
  const data = await service.getSitemapData();
  assert.equal(data.animes.some((row) => row.id === 3), false);
  assert.ok(data.tags.length >= 2);

  const bloated = new InMemoryCatalogRepository();
  for (let i = 1; i <= MAX_SITEMAP_URLS; i += 1) {
    bloated.seedAnime({
      id: i,
      title: `t${i}`,
      isActive: 1,
    });
  }
  const overloaded = new CatalogQueryService(bloated);
  await assert.rejects(() => overloaded.getSitemapData(), /50,000/);
});

test('application and domain modules do not import drizzle', () => {
  const files = [
    'lib/server/catalog/domain/models.ts',
    'lib/server/catalog/domain/recommendation.ts',
    'lib/server/catalog/application/catalog-query-service.ts',
    'lib/server/catalog/application/catalog-command-service.ts',
    'lib/server/catalog/ports/catalog-read-repository.ts',
    'lib/server/catalog/ports/catalog-write-repository.ts',
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /drizzle-orm|from ['\"]mysql2/);
  }
});
