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
      ingestionMode: 'full',
      source: 'ikun',
      sourceId: '69403',
      title: 'JP anime title',
      videoUrl: 'https://cdn.example/a.m3u8',
      coverUrl: 'https://cdn.example/cover.jpg',
      tags: ['日本动漫'],
    }),
  );

  assert.deepEqual(result, {
    kind: 'upserted',
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
      ingestionMode: 'full',
      source: 'wujin',
      sourceId: '1',
      title: 'race',
      videoUrl: 'https://cdn.example/x.m3u8',
    }),
  );

  assert.deepEqual(result, {
    kind: 'upserted',
    animeId: 88,
    workId: 88,
    created: false,
    target: 'anime_works',
  });
  assert.ok(
    calls.some(({ sql, params }) => sql.includes('DELETE FROM anime_works') && params[0] === 99),
  );
});

test('full MacCMS recrawl updates its line without deleting supplemental lines', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const existingLines = [
    {
      name: 'ik',
      flag: 'ik',
      episodes: [{ name: '第1集', url: 'https://old.example/ik-1.m3u8' }],
    },
    {
      name: '红牛',
      flag: 'hongniu',
      episodes: [{ name: '第1集', url: 'https://hn.example/1.m3u8' }],
    },
  ];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT work_id FROM anime_work_sources')) {
        return [[{ work_id: 55 }], []];
      }
      if (sql.includes('SELECT play_lines_json FROM anime_works')) {
        return [[{ play_lines_json: JSON.stringify(existingLines) }], []];
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
      source: 'ikun',
      sourceId: '55',
      title: '東京猫猫',
      videoUrl: 'https://new.example/ik-2.m3u8',
      playLines: [{
        name: 'ik',
        flag: 'ik',
        episodes: [{ name: '第2集', url: 'https://new.example/ik-2.m3u8' }],
      }],
    }),
  );

  const update = calls.find(({ sql }) => sql.includes('UPDATE anime_works SET'));
  assert.ok(update);
  const lines = JSON.parse(String(update.params[8])) as Array<{ flag?: string; episodes: unknown[] }>;
  assert.deepEqual(lines.map(({ flag }) => flag), ['ik', 'hongniu']);
  assert.equal(lines[0].episodes.length, 1);
  assert.match(JSON.stringify(lines[0]), /ik-2\.m3u8/);
  assert.match(JSON.stringify(lines[1]), /hn\.example/);
});

test('playback-only source uniquely matches and binds an existing work, then updates lines only', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const connection: CrawlerTransactionConnection = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT work_id FROM anime_work_sources')) return [[], []];
      if (sql.includes('SELECT play_lines_json FROM anime_works')) {
        return [[{
          play_lines_json: JSON.stringify([{
            name: 'ik',
            flag: 'ik',
            episodes: [{ name: '第1集', url: 'https://ik.example/1.m3u8' }],
          }]),
        }], []];
      }
      if (sql.includes('FROM anime_works') && sql.includes('is_active = 1')) {
        return [[{
          id: 21,
          title: '東京 猫猫！',
          title_english: 'Tokyo Cats',
          title_japanese: null,
          aliases: null,
          release_year: 2026,
          play_lines_json: JSON.stringify([{
            name: 'ik',
            flag: 'ik',
            episodes: [{ name: '第1集', url: 'https://ik.example/1.m3u8' }],
          }]),
        }], []];
      }
      return [{ insertId: 1, affectedRows: 1 }, []];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const uow = createMariaDbCrawlerUnitOfWork(async () => connection);

  const result = await uow.runInTransaction(() =>
    new MariaDbCrawlerCatalogIngestion().upsertFromCrawler({
      ingestionMode: 'playback_only',
      source: 'hongniu',
      sourceId: '900',
      title: '東京猫猫',
      videoUrl: 'https://hn.example/1.m3u8',
      releaseYear: 2026,
      playLines: [{
        name: '红牛',
        flag: 'hongniu',
        episodes: [{ name: '第1集', url: 'https://hn.example/1.m3u8' }],
      }],
    }),
  );

  assert.deepEqual(result, {
    kind: 'upserted',
    animeId: 21,
    workId: 21,
    created: false,
    target: 'anime_works',
  });
  const mappingInsert = calls.find(({ sql }) => sql.includes('INSERT INTO anime_work_sources'));
  assert.deepEqual(mappingInsert?.params.slice(0, 3), [21, 'hongniu', '900']);
  const update = calls.find(({ sql }) => sql.includes('UPDATE anime_works SET'));
  assert.ok(update);
  assert.match(update.sql, /play_lines_json = \?/);
  assert.doesNotMatch(update.sql, /title =|cover_url|stream_url|description/);
  assert.deepEqual(
    (JSON.parse(String(update.params[0])) as Array<{ flag?: string }>).map(({ flag }) => flag),
    ['ik', 'hongniu'],
  );
  assert.equal(calls.some(({ sql }) => sql.includes('INSERT INTO anime_works')), false);
  assert.equal(calls.some(({ sql }) => sql.includes('anime_work_tags')), false);
  assert.equal(calls.some(({ sql }) => sql.includes('work_tags')), false);
  const candidateRead = calls.find(({ sql }) => sql.includes('is_active = 1'));
  assert.ok(candidateRead);
  assert.doesNotMatch(candidateRead.sql, /FOR UPDATE/);
  assert.equal(
    calls.some(({ sql }) => sql.includes('SELECT play_lines_json FROM anime_works') && sql.includes('FOR UPDATE')),
    true,
  );
});

test('playback-only source skips missing, ambiguous, and empty-line matches without writes', async () => {
  const scenarios = [
    {
      candidates: [],
      expected: 'CATALOG_MATCH_NOT_FOUND',
      lines: [{ name: 'hongniu', flag: 'hongniu', episodes: [{ name: '第1集', url: 'https://hn/1.m3u8' }] }],
    },
    {
      candidates: [
        { id: 1, title: 'Same', release_year: 2026 },
        { id: 2, title: 'Same', release_year: 2026 },
      ],
      expected: 'CATALOG_MATCH_AMBIGUOUS',
      lines: [{ name: 'hongniu', flag: 'hongniu', episodes: [{ name: '第1集', url: 'https://hn/1.m3u8' }] }],
    },
    {
      candidates: [{ id: 1, title: 'Same', release_year: 2026 }],
      expected: 'RESULT_INVALID',
      lines: [],
    },
  ] as const;

  for (const scenario of scenarios) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const connection: CrawlerTransactionConnection = {
      async query(sql: string, params: unknown[] = []) {
        calls.push({ sql, params });
        if (sql.includes('SELECT work_id FROM anime_work_sources')) return [[], []];
        if (sql.includes('FROM anime_works') && sql.includes('is_active = 1')) {
          return [scenario.candidates, []];
        }
        return [{ insertId: 99, affectedRows: 1 }, []];
      },
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      release() {},
    };
    const uow = createMariaDbCrawlerUnitOfWork(async () => connection);

    const result = await uow.runInTransaction(() =>
      new MariaDbCrawlerCatalogIngestion().upsertFromCrawler({
        ingestionMode: 'playback_only',
        source: 'hongniu',
        sourceId: scenario.expected,
        title: 'Same',
        videoUrl: 'https://hn.example/1.m3u8',
        releaseYear: 2026,
        playLines: scenario.lines,
      }),
    );

    assert.equal(result.kind, 'skipped');
    assert.equal(result.kind === 'skipped' ? result.code : null, scenario.expected);
    assert.equal(calls.some(({ sql }) => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)), false);
  }
});
