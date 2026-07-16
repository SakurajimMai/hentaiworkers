import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMariaDbCrawlerUnitOfWork,
  type CrawlerTransactionConnection,
} from '../../lib/server/infrastructure/database/mariadb-crawler-repositories';
import { MariaDbCrawlerCatalogIngestion } from '../../lib/server/infrastructure/database/mariadb-crawler-catalog-ingestion';

test('MacCMS ikun source writes anime_works not animes', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let mappingReads = 0;
  const connection: CrawlerTransactionConnection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT work_id FROM anime_work_sources')) {
        mappingReads += 1;
        return [mappingReads === 1 ? [] : [{ work_id: 55 }], []];
      }
      if (sql.includes('INSERT INTO anime_works')) {
        return [{ insertId: 55, affectedRows: 1 }, []];
      }
      if (sql.includes('INSERT INTO anime_work_sources')) {
        return [{ insertId: 1, affectedRows: 1 }, []];
      }
      if (sql.includes('SELECT id FROM work_tags')) {
        return [[{ id: 7 }], []];
      }
      return [{ affectedRows: 1 }, []];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);

  const result = await uow.runInTransaction(() =>
    new MariaDbCrawlerCatalogIngestion().upsertFromCrawler({
      source: 'ikun',
      sourceId: '69403',
      title: 'JP anime title',
      videoUrl: 'https://cdn.example/a.m3u8',
      coverUrl: 'https://cdn.example/cover.jpg',
      tags: ['日本动漫'],
    }),
  );

  assert.deepEqual(result, {
    animeId: 55,
    workId: 55,
    created: true,
    target: 'anime_works',
  });
  assert.ok(calls.some(({ sql }) => sql.includes('INSERT INTO anime_works')));
  assert.ok(calls.some(({ sql }) => sql.includes('INSERT INTO anime_work_sources')));
  assert.ok(calls.some(({ sql }) => sql.includes('INSERT INTO anime_work_tags')));
  assert.ok(calls.some(({ sql }) => sql.includes('INSERT INTO work_tags')));
  assert.equal(
    calls.some(({ sql }) => sql.includes('INSERT INTO tags ')),
    false,
  );
  assert.equal(
    calls.some(({ sql }) => sql.includes('INSERT INTO animes')),
    false,
  );
  assert.equal(
    calls.some(({ sql }) => sql.includes('INSERT INTO anime_sources ')),
    false,
  );
});

test('MacCMS concurrent source mapping deletes orphan work row', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let mappingReads = 0;
  const connection: CrawlerTransactionConnection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT work_id FROM anime_work_sources')) {
        mappingReads += 1;
        return [mappingReads === 1 ? [] : [{ work_id: 88 }], []];
      }
      if (sql.includes('INSERT INTO anime_works')) {
        return [{ insertId: 99, affectedRows: 1 }, []];
      }
      if (sql.includes('INSERT INTO anime_work_sources')) {
        const error = new Error('Duplicate entry') as Error & { code: string };
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      return [{ affectedRows: 1 }, []];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);

  const result = await uow.runInTransaction(() =>
    new MariaDbCrawlerCatalogIngestion().upsertFromCrawler({
      source: 'wujin',
      sourceId: '1',
      title: 'race',
      videoUrl: 'https://cdn.example/x.m3u8',
    }),
  );

  assert.deepEqual(result, {
    animeId: 88,
    workId: 88,
    created: false,
    target: 'anime_works',
  });
  assert.ok(
    calls.some(({ sql, params }) => sql.includes('DELETE FROM anime_works') && params[0] === 99),
  );
});
