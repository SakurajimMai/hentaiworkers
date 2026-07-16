import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogQueryService } from '../../lib/server/catalog/application/catalog-query-service';
import { InMemoryCatalogRepository } from '../../lib/server/catalog/testing/in-memory-catalog-repository';

test('list search matches english title and description', async () => {
  const repo = new InMemoryCatalogRepository();
  repo.seedAnime({
    id: 1,
    title: '主标题',
    titleEnglish: 'Moonlight Echo',
    titleJapanese: null,
    description: 'A quiet story about rain',
    cover: null,
    fanart: null,
    videoUrl: 'https://cdn.example/a.mp4',
    viewCount: 10,
    isActive: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    tagIds: [],
  });
  repo.seedAnime({
    id: 2,
    title: '其他',
    titleEnglish: 'Other',
    titleJapanese: null,
    description: 'nothing',
    cover: null,
    fanart: null,
    videoUrl: 'https://cdn.example/b.mp4',
    viewCount: 1,
    isActive: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    tagIds: [],
  });

  const service = new CatalogQueryService(repo);
  const byEnglish = await service.list({ search: 'Moonlight', page: 1, limit: 10 });
  assert.equal(byEnglish.data.length, 1);
  assert.equal(byEnglish.data[0]?.id, 1);

  const byDesc = await service.list({ search: 'rain', page: 1, limit: 10 });
  assert.equal(byDesc.data.length, 1);
  assert.equal(byDesc.data[0]?.id, 1);
});

test('recommendFromSeeds excludes completed and uses shared tags', async () => {
  const repo = new InMemoryCatalogRepository();
  repo.seedTag({ id: 1, name: 'Drama', description: null });
  repo.seedAnime({
    id: 10,
    title: 'Seed',
    titleEnglish: null,
    titleJapanese: null,
    description: null,
    cover: null,
    fanart: null,
    videoUrl: 'https://cdn.example/s.mp4',
    viewCount: 5,
    isActive: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    tagIds: [1],
  });
  repo.seedAnime({
    id: 11,
    title: 'Related',
    titleEnglish: null,
    titleJapanese: null,
    description: null,
    cover: null,
    fanart: null,
    videoUrl: 'https://cdn.example/r.mp4',
    viewCount: 50,
    isActive: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    tagIds: [1],
  });
  repo.seedAnime({
    id: 12,
    title: 'Done',
    titleEnglish: null,
    titleJapanese: null,
    description: null,
    cover: null,
    fanart: null,
    videoUrl: 'https://cdn.example/d.mp4',
    viewCount: 99,
    isActive: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    tagIds: [1],
  });

  const service = new CatalogQueryService(repo);
  const recs = await service.recommendFromSeeds([10], { excludeIds: [12], limit: 10 });
  assert.ok(recs.some((r) => r.id === 11));
  assert.ok(!recs.some((r) => r.id === 12));
  assert.ok(!recs.some((r) => r.id === 10));
});
