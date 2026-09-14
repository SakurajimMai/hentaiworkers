import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CatalogQueryService } from '../../lib/server/catalog/application/catalog-query-service';
import { InMemoryCatalogRepository } from '../../lib/server/catalog/testing/in-memory-catalog-repository';
import type { CatalogReadRepository } from '../../lib/server/catalog/ports/catalog-read-repository';

function seedRepository() {
  const repository = new InMemoryCatalogRepository();
  repository.seedAnime({ id: 2820, title: '收藏统计样本', isActive: 1, viewCount: 0 });
  repository.seedAnime({ id: 2821, title: '无人收藏', isActive: 1, viewCount: 0 });
  // Two users' system favourites lists.
  repository.seedUserList({ id: 11, listType: 'favorites', isSystem: 1 });
  repository.seedUserList({ id: 12, listType: 'favorites', isSystem: 1 });
  // A custom list and a non-system list with the same name must not count.
  repository.seedUserList({ id: 13, listType: 'custom', isSystem: 0 });
  repository.seedUserList({ id: 14, listType: 'favorites', isSystem: 0 });
  return repository;
}

/** Explicit delegate: class methods live on the prototype and do not spread. */
function delegating(
  repository: InMemoryCatalogRepository,
  overrides: Partial<CatalogReadRepository>,
): CatalogReadRepository {
  return {
    list: (input) => repository.list(input),
    getById: (id) => repository.getById(id),
    countFavorites: (id) => repository.countFavorites(id),
    listTags: () => repository.listTags(),
    getSitemapData: () => repository.getSitemapData(),
    listByTitlePrefix: (input) => repository.listByTitlePrefix(input),
    listBySharedTags: (input) => repository.listBySharedTags(input),
    listPopular: (input) => repository.listPopular(input),
    listTagIdsForAnime: (id) => repository.listTagIdsForAnime(id),
    ...overrides,
  };
}

async function withMutedConsoleError<T>(run: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
}

test('详情的收藏数只统计系统收藏列表里的条目', async () => {
  const repository = seedRepository();
  repository.seedUserListItem({ listId: 11, animeId: 2820 });
  repository.seedUserListItem({ listId: 12, animeId: 2820 });
  repository.seedUserListItem({ listId: 13, animeId: 2820 });
  repository.seedUserListItem({ listId: 14, animeId: 2820 });
  repository.seedUserListItem({ listId: 11, animeId: 2821 });

  const service = new CatalogQueryService(repository);
  const detail = await service.getById(2820);

  assert.equal(detail?.favoriteCount, 2);
  assert.equal((await service.getById(2821))?.favoriteCount, 1);
});

test('没有收藏时返回 0，不再返回死列里的占位值', async () => {
  const repository = seedRepository();
  const service = new CatalogQueryService(repository);

  assert.equal((await service.getById(2820))?.favoriteCount, 0);
  // The repository layer never reports the stored column.
  assert.equal((await repository.getById(2820))?.favoriteCount, null);
});

test('取消收藏后详情立即减少，不需要任何计数列维护', async () => {
  const repository = seedRepository();
  repository.seedUserListItem({ listId: 11, animeId: 2820 });
  const service = new CatalogQueryService(repository);
  assert.equal((await service.getById(2820))?.favoriteCount, 1);

  const removing = new InMemoryCatalogRepository();
  removing.seedAnime({ id: 2820, title: '收藏统计样本', isActive: 1 });
  removing.seedUserList({ id: 11, listType: 'favorites', isSystem: 1 });
  assert.equal((await new CatalogQueryService(removing).getById(2820))?.favoriteCount, 0);
});

test('不存在的作品不会触发收藏统计', async () => {
  const repository = seedRepository();
  let counts = 0;
  const spied = delegating(repository, {
    countFavorites: (id) => {
      counts += 1;
      return repository.countFavorites(id);
    },
  });

  assert.equal(await new CatalogQueryService(spied).getById(909090), null);
  assert.equal(counts, 0);
});

test('收藏统计失败时降级为 null（未知），不编造数字也不拖垮详情', async () => {
  const repository = seedRepository();
  const failing = delegating(repository, {
    countFavorites: async () => {
      throw new Error('synthetic favorites failure');
    },
  });

  const detail = await withMutedConsoleError(() =>
    new CatalogQueryService(failing).getById(2820),
  );

  assert.equal(detail?.id, 2820);
  assert.equal(detail?.favoriteCount, null);
});

test('MariaDB 收藏统计只读系统收藏列表，不读旧 user_favorites 表', () => {
  const adapter = readFileSync(
    'lib/server/infrastructure/database/mariadb-catalog-repository.ts',
    'utf8',
  );
  const start = adapter.indexOf('export const ANIME_FAVORITE_COUNT_SQL');
  const end = adapter.indexOf('export class MariaDbCatalogRepository');
  assert.ok(start >= 0 && end > start);
  const countSql = adapter.slice(start, end);

  assert.match(countSql, /FROM user_list_items i/);
  assert.match(countSql, /INNER JOIN user_lists l ON l\.id = i\.list_id/);
  assert.match(countSql, /WHERE i\.anime_id = \?/);
  assert.match(countSql, /l\.list_type = 'favorites'/);
  assert.match(countSql, /l\.is_system = 1/);
  assert.doesNotMatch(countSql, /user_favorites/);

  const getById = adapter.slice(
    adapter.indexOf('getById(id: number): Promise<AnimeDetail | null>'),
    adapter.indexOf('countFavorites(animeId: number): Promise<number>'),
  );
  assert.match(getById, /favoriteCount: null/);
});

test('animes.favorite_count 在 schema 中标注为不再维护', () => {
  const schema = readFileSync('lib/schema.ts', 'utf8');
  const animeTable = schema.slice(
    schema.indexOf("export const animes = mysqlTable("),
    schema.indexOf('export const tags = mysqlTable('),
  );
  assert.match(animeTable, /NOT MAINTAINED — do not read/);
  assert.match(animeTable, /favoriteCount: int\('favorite_count'\)/);
});
