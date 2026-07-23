import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMariaDbCrawlerUnitOfWork,
  type CrawlerTransactionConnection,
} from '../../lib/server/infrastructure/database/mariadb-crawler-repositories';
import { MariaDbCrawlerCatalogIngestion } from '../../lib/server/infrastructure/database/mariadb-crawler-catalog-ingestion';

test('catalog ingestion resolves a concurrent source mapping without leaving a duplicate anime', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let mappingReads = 0;
  const connection: CrawlerTransactionConnection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT anime_id FROM anime_sources')) {
        mappingReads += 1;
        return [mappingReads === 1 ? [] : [{ anime_id: 73 }], []];
      }
      if (sql.includes('INSERT INTO animes')) {
        return [{ insertId: 99, affectedRows: 1 }, []];
      }
      if (sql.includes('INSERT INTO anime_sources')) {
        const error = new Error('Duplicate entry for anime_sources_source_uidx') as Error & {
          code: string;
        };
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
      ingestionMode: 'full',
      source: 'hanime',
      sourceId: '42',
      title: 'Concurrent title',
      videoUrl: 'https://cdn.example/42.mp4',
    }),
  );

  assert.deepEqual(result, {
    kind: 'upserted',
    animeId: 73,
    created: false,
    target: 'legacy_animes',
  });
  assert.ok(
    calls.some(({ sql, params }) => sql.includes('DELETE FROM animes') && params[0] === 99),
  );
  assert.ok(
    calls.some(({ sql, params }) => sql.includes('UPDATE animes SET') && params.at(-1) === 73),
  );
});

test('Hanime ingestion assigns the legacy 里番 category', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT id FROM categories')) return [[{ id: 1 }], []];
      if (sql.includes('SELECT anime_id FROM anime_sources')) return [[], []];
      if (sql.includes('INSERT INTO animes')) return [{ insertId: 88, affectedRows: 1 }, []];
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
      ingestionMode: 'full',
      source: 'hanime',
      sourceId: '88',
      title: 'Category title',
      videoUrl: 'https://cdn.example/88.mp4',
    }),
  );

  assert.equal(result.kind, 'upserted');
  assert.equal(result.kind === 'upserted' ? result.animeId : null, 88);
  assert.ok(calls.some(({ sql, params }) =>
    sql.includes('SELECT id FROM categories') && params[0] === '里番'));
  const insert = calls.find(({ sql }) => sql.includes('INSERT INTO animes'));
  assert.equal(insert?.params.at(-1), 1);
});

test('source existence lookup routes Hanime and MacCMS to separate mappings', async () => {
  const connection: CrawlerTransactionConnection = {
    async query(sql: string) {
      if (sql.includes('anime_work_sources')) return [[{ work_id: 21 }], []];
      if (sql.includes('anime_sources')) return [[{ anime_id: 12 }], []];
      return [[], []];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);
  const ingestion = new MariaDbCrawlerCatalogIngestion();

  const [hanime, maccms] = await uow.runInTransaction(async () => [
    await ingestion.findExistingBySource('hanime', '12'),
    await ingestion.findExistingBySource('ikun', '21'),
  ]);

  assert.deepEqual(hanime, {
    kind: 'upserted',
    animeId: 12,
    created: false,
    target: 'legacy_animes',
  });
  assert.deepEqual(maccms, {
    kind: 'upserted',
    animeId: 21,
    workId: 21,
    created: false,
    target: 'anime_works',
  });
});

test('catalog update preserves optional metadata that the latest crawl omitted', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT anime_id FROM anime_sources')) {
        return [[{ anime_id: 12 }], []];
      }
      return [{ affectedRows: 1 }, []];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);

  await uow.runInTransaction(() =>
    new MariaDbCrawlerCatalogIngestion().upsertFromCrawler({
      ingestionMode: 'full',
      source: 'hanime',
      sourceId: '12',
      title: 'Updated title',
      videoUrl: 'https://cdn.example/12.mp4',
    }),
  );

  const update = calls.find(({ sql }) => sql.includes('UPDATE animes SET'));
  assert.ok(update);
  assert.match(update.sql, /description = COALESCE\(\?, description\)/);
  assert.match(update.sql, /cover = COALESCE\(\?, cover\)/);
  assert.match(update.sql, /fanart = COALESCE\(\?, fanart\)/);
});
