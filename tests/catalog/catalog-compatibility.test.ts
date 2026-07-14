import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSimilarAnimes,
  getAnimeById,
  listAnimes,
  listTags,
  listSitemapData,
} from '../../lib/anime-service';
import { CatalogQueryService } from '../../lib/server/catalog/application/catalog-query-service';
import {
  setCatalogQueryServiceForTests,
} from '../../lib/server/catalog';
import { InMemoryCatalogRepository } from '../../lib/server/catalog/testing/in-memory-catalog-repository';

function seedRepo() {
  const repo = new InMemoryCatalogRepository();
  repo.seedTag({ id: 10, name: 'A', description: null });
  repo.seedAnime({
    id: 101,
    title: '兼容作品 1',
    titleEnglish: 'Compat 1',
    isActive: 1,
    viewCount: 42,
    createdAt: '2026-03-01',
    tagIds: [10],
    cover: 'https://example.com/a.jpg',
  });
  repo.seedAnime({
    id: 102,
    title: '兼容作品 2',
    isActive: null,
    viewCount: 10,
    createdAt: '2026-03-02',
    tagIds: [10],
  });
  return repo;
}

test('anime-service facade delegates to CatalogQueryService with identical results', async () => {
  const repo = seedRepo();
  const service = new CatalogQueryService(repo);
  setCatalogQueryServiceForTests(service);

  try {
    const listDirect = await service.list({ page: 1, limit: 10, sort: 'popular' });
    const listFacade = await listAnimes({ page: 1, limit: 10, sort: 'popular' });
    assert.deepEqual(listFacade, listDirect);

    const detailDirect = await service.getById(101);
    const detailFacade = await getAnimeById(101);
    assert.deepEqual(detailFacade, detailDirect);

    const tagsDirect = await service.listTags();
    const tagsFacade = await listTags();
    assert.deepEqual(tagsFacade, tagsDirect);

    const similarDirect = await service.getSimilar(101, 5);
    const similarFacade = await getSimilarAnimes(101, 5);
    assert.deepEqual(similarFacade, similarDirect);

    const sitemapDirect = await service.getSitemapData();
    const sitemapFacade = await listSitemapData();
    assert.deepEqual(sitemapFacade, sitemapDirect);
  } finally {
    setCatalogQueryServiceForTests(undefined);
  }
});

test('facade keeps public export names callable', async () => {
  const repo = seedRepo();
  setCatalogQueryServiceForTests(new CatalogQueryService(repo));
  try {
    assert.equal(typeof listAnimes, 'function');
    assert.equal(typeof getAnimeById, 'function');
    assert.equal(typeof getSimilarAnimes, 'function');
    assert.equal(typeof listTags, 'function');
    assert.equal(typeof listSitemapData, 'function');
    const page = await listAnimes({ sort: 'latest' });
    assert.ok(page.pagination.total >= 2);
  } finally {
    setCatalogQueryServiceForTests(undefined);
  }
});
