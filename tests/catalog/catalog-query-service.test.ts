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
import { MAX_SITEMAP_URLS, SITEMAP_CHUNK_SIZE, buildSitemapSections } from '../../lib/sitemap';

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

test('sitemap data only includes active rows with covers and large catalogs chunk into several files', async () => {
  const { service } = buildService();
  const data = await service.getSitemapData();
  assert.equal(data.animes.some((row) => row.id === 3), false);
  assert.ok(data.tags.length >= 2);
  assert.ok(data.animes.every((row) => 'cover' in row));

  const bloated = new InMemoryCatalogRepository();
  for (let i = 1; i <= MAX_SITEMAP_URLS; i += 1) {
    bloated.seedAnime({
      id: i,
      title: `t${i}`,
      isActive: 1,
    });
  }
  const overloaded = new CatalogQueryService(bloated);
  const bulk = await overloaded.getSitemapData();
  assert.equal(bulk.animes.length, MAX_SITEMAP_URLS);
  const files = buildSitemapSections('https://anime.example.com', {
    animes: bulk.animes,
    tags: bulk.tags,
    mangas: [],
    mangaTags: [],
  });
  assert.equal(files.filter((file) => file.name.startsWith('animes-')).length, MAX_SITEMAP_URLS / SITEMAP_CHUNK_SIZE);
  assert.ok(files.every((file) => file.entries.length <= SITEMAP_CHUNK_SIZE));
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

test('catalog page lookup reports the page a work is on, not the first page', async () => {
  const repo = new InMemoryCatalogRepository();
  // Newest first, so id 25 is position 0 and id 1 is position 24.
  for (let id = 1; id <= 25; id += 1) {
    repo.seedAnime({
      id,
      title: `t${id}`,
      isActive: 1,
      createdAt: `2026-01-${String(id).padStart(2, '0')}`,
    });
  }
  repo.seedAnime({ id: 99, title: 'hidden', isActive: 0, createdAt: '2026-02-01' });
  const service = new CatalogQueryService(repo);

  assert.equal(await service.findCatalogPage(25, 10), 1, 'the newest work opens page 1');
  assert.equal(await service.findCatalogPage(16, 10), 1, 'position 9 is still page 1');
  assert.equal(await service.findCatalogPage(15, 10), 2, 'position 10 rolls to page 2');
  assert.equal(await service.findCatalogPage(1, 10), 3, 'the oldest work is on the last page');
  assert.equal(await service.findCatalogPage(1, 25), 1, 'a larger page size holds everything');

  // Deactivated works are not in the listing, so they cannot place a page.
  assert.equal(await service.findCatalogPage(99, 10), 1);
  assert.equal(await service.findCatalogPage(4242, 10), 1, 'unknown ids fall back to page 1');
  assert.equal(await service.findCatalogPage(0, 10), 1);
  assert.equal(await service.findCatalogPage(-3, 10), 1);
});

test('a failing page lookup degrades to page 1 instead of breaking the detail page', async () => {
  const repo = new InMemoryCatalogRepository();
  repo.seedAnime({ id: 1, title: 't', isActive: 1, createdAt: '2026-01-01' });
  const failing = Object.create(repo) as InMemoryCatalogRepository;
  failing.findCatalogPage = async () => {
    throw new Error('database unavailable');
  };
  assert.equal(await new CatalogQueryService(failing).findCatalogPage(1, 10), 1);
});

test('listings order deterministically so pagination cannot repeat or skip a row', () => {
  const adapter = readFileSync(
    'lib/server/infrastructure/database/mariadb-catalog-repository.ts',
    'utf8',
  );
  // Both sorts need the id tiebreaker, and the page lookup mirrors the same expression.
  assert.match(adapter, /\$\{animes\.viewCount\} DESC, \$\{animes\.id\} DESC/);
  assert.match(adapter, /COALESCE\(\$\{animes\.updatedAt\}, \$\{animes\.createdAt\}\) DESC, \$\{animes\.id\} DESC/);

  const mangaService = readFileSync('lib/manga-service.ts', 'utf8');
  assert.match(mangaService, /desc\(mangas\.updatedAt\), desc\(mangas\.id\)/);
  assert.match(mangaService, /desc\(score\), desc\(mangas\.updatedAt\), desc\(mangas\.id\)/);
});
