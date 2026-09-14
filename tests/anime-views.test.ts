import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ANIME_VIEW_DAY_SQL,
  ANIME_VIEW_DAYS_DDL,
  ANIME_VIEW_DEDUP_DDL,
  ANIME_VIEW_DEDUP_INSERT_SQL,
  ANIME_VIEW_TOTAL_SQL,
  createAnimeViewRecorder,
  type AnimeViewDatabase,
} from '../lib/anime-views';

type RecordedCall = { sql: string; params: readonly unknown[]; inRetry: boolean };

function isDedupInsert(sql: string) {
  return sql.includes('INSERT IGNORE INTO anime_view_dedup');
}

function isTotalUpdate(sql: string) {
  return sql.includes('UPDATE animes');
}

function isDayUpsert(sql: string) {
  return sql.includes('INSERT INTO anime_view_days');
}

function isDdl(sql: string) {
  return sql.includes('CREATE TABLE IF NOT EXISTS');
}

function createFakeDatabase(options: {
  visibleAnimeIds?: readonly number[];
  failWhen?: (sql: string) => boolean;
} = {}) {
  const visible = new Set(options.visibleAnimeIds ?? [1, 2]);
  const calls: RecordedCall[] = [];
  const dedup = new Set<string>();
  const dayCounts = new Map<string, number>();
  const totals = new Map<number, number>();
  let retryDepth = 0;

  const database: AnimeViewDatabase = {
    async run(sql, params = []) {
      calls.push({ sql, params, inRetry: retryDepth > 0 });
      if (options.failWhen?.(sql)) throw new Error('synthetic database failure');
      if (isDedupInsert(sql)) {
        const key = params.join('|');
        if (dedup.has(key)) return 0;
        dedup.add(key);
        return 1;
      }
      if (isTotalUpdate(sql)) {
        const animeId = Number(params[0]);
        if (!visible.has(animeId)) return 0;
        totals.set(animeId, (totals.get(animeId) ?? 0) + 1);
        return 1;
      }
      if (isDayUpsert(sql)) {
        const key = params.join('|');
        dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
        return 1;
      }
      return 0;
    },
    async withRetry(operation) {
      retryDepth += 1;
      try {
        return await operation();
      } finally {
        retryDepth -= 1;
      }
    },
  };

  return {
    database,
    calls,
    dayCounts,
    totals,
    sqlOf: (predicate: (sql: string) => boolean) =>
      calls.filter((call) => predicate(call.sql)),
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

test('首次播放只建表一次，并在同一次重试作用域内推进日表与计数器各一次', async () => {
  const fake = createFakeDatabase();
  const record = createAnimeViewRecorder({
    database: fake.database,
    resolveViewerKey: async () => 'a:viewer-1',
    today: () => '2026-09-14',
  });

  await record(1);
  await record(1);

  assert.equal(fake.sqlOf(isDdl).length, 2);
  assert.equal(fake.totals.get(1), 1);
  assert.equal(fake.dayCounts.get('1|2026-09-14'), 1);
  assert.equal(fake.sqlOf(isTotalUpdate).length, 1);
  assert.equal(fake.sqlOf(isDayUpsert).length, 1);
  assert.equal(
    fake.calls
      .filter((call) => !isDdl(call.sql))
      .every((call) => call.inRetry),
    true,
  );
});

test('同一访客同日只计一次，换访客或换日期各自再计一次', async () => {
  const fake = createFakeDatabase();
  let viewer = 'a:viewer-1';
  let day = '2026-09-14';
  const record = createAnimeViewRecorder({
    database: fake.database,
    resolveViewerKey: async () => viewer,
    today: () => day,
  });

  await record(1);
  await record(1);
  viewer = 'u:7';
  await record(1);
  viewer = 'a:viewer-1';
  day = '2026-09-15';
  await record(1);

  assert.equal(fake.totals.get(1), 3);
  assert.equal(fake.dayCounts.get('1|2026-09-14'), 2);
  assert.equal(fake.dayCounts.get('1|2026-09-15'), 1);
  assert.equal(fake.sqlOf(isDedupInsert).length, 4);
});

test('不同作品的计数互不影响', async () => {
  const fake = createFakeDatabase();
  const record = createAnimeViewRecorder({
    database: fake.database,
    resolveViewerKey: async () => 'a:viewer-1',
    today: () => '2026-09-14',
  });

  await record(1);
  await record(2);

  assert.equal(fake.totals.get(1), 1);
  assert.equal(fake.totals.get(2), 1);
  assert.equal(fake.dayCounts.get('2|2026-09-14'), 1);
});

test('非法作品 id 完全不访问数据库', async () => {
  const fake = createFakeDatabase();
  const record = createAnimeViewRecorder({
    database: fake.database,
    resolveViewerKey: async () => 'a:viewer-1',
    today: () => '2026-09-14',
  });

  for (const id of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await record(id);
  }

  assert.equal(fake.calls.length, 0);
});

test('不存在或已下架的作品不会写入日表', async () => {
  const fake = createFakeDatabase({ visibleAnimeIds: [1] });
  const record = createAnimeViewRecorder({
    database: fake.database,
    resolveViewerKey: async () => 'a:viewer-1',
    today: () => '2026-09-14',
  });

  await record(999);

  assert.equal(fake.sqlOf(isTotalUpdate).length, 1);
  assert.equal(fake.sqlOf(isDayUpsert).length, 0);
  assert.equal(fake.dayCounts.size, 0);
});

test('写入失败不会抛给调用方，也不会继续后续写入', async () => {
  const fake = createFakeDatabase({ failWhen: isDedupInsert });
  const record = createAnimeViewRecorder({
    database: fake.database,
    resolveViewerKey: async () => 'a:viewer-1',
    today: () => '2026-09-14',
  });

  await withMutedConsoleError(() => record(1));

  assert.equal(fake.sqlOf(isTotalUpdate).length, 0);
  assert.equal(fake.sqlOf(isDayUpsert).length, 0);
});

test('访客标识解析失败不会抛给调用方', async () => {
  const fake = createFakeDatabase();
  const record = createAnimeViewRecorder({
    database: fake.database,
    resolveViewerKey: async () => {
      throw new Error('synthetic identity failure');
    },
    today: () => '2026-09-14',
  });

  await withMutedConsoleError(() => record(1));

  assert.equal(fake.sqlOf(isDedupInsert).length, 0);
});

test('建表失败后缓存复位，下一次请求会重试 DDL 并恢复计数', async () => {
  let failDdl = true;
  const fake = createFakeDatabase({ failWhen: (sql) => failDdl && isDdl(sql) });
  const record = createAnimeViewRecorder({
    database: fake.database,
    resolveViewerKey: async () => 'a:viewer-1',
    today: () => '2026-09-14',
  });

  await withMutedConsoleError(() => record(1));
  assert.equal(fake.sqlOf(isDedupInsert).length, 0);

  failDdl = false;
  await record(1);

  assert.equal(fake.sqlOf(isDdl).length, 3);
  assert.equal(fake.totals.get(1), 1);
});

test('0020 迁移建好两张表，并把随机种子重置留成注释', () => {
  const sql = readFileSync(
    new URL('../drizzle/migrations/0020-anime-views.sql', import.meta.url),
    'utf8',
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS anime_view_days/);
  assert.match(sql, /PRIMARY KEY \(anime_id, day\)/);
  assert.match(sql, /INDEX anime_view_days_day_idx \(day\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS anime_view_dedup/);
  assert.match(sql, /PRIMARY KEY \(anime_id, viewer_key, day\)/);
  assert.equal(sql.match(/ENGINE=InnoDB DEFAULT CHARSET=utf8mb4/g)?.length, 2);

  // The crawler's random seeds are cleared by the migration itself, so every count the
  // site shows afterwards is real. This must stay executable, not commented out.
  const executable = sql.replace(/^\s*--.*$/gm, '');
  assert.match(executable, /UPDATE animes SET view_count = 0;/);
  assert.doesNotMatch(executable, /favorite_count/i);
});

test('运行时 DDL 与写入语句和迁移保持同一张表结构', () => {
  assert.match(ANIME_VIEW_DAYS_DDL, /anime_view_days/);
  assert.match(ANIME_VIEW_DEDUP_DDL, /anime_view_dedup/);
  assert.match(ANIME_VIEW_DEDUP_INSERT_SQL, /INSERT IGNORE INTO anime_view_dedup/);
  // The counter update is the cheap existence/visibility guard.
  assert.match(ANIME_VIEW_TOTAL_SQL, /is_active = 1 OR is_active IS NULL/);
  assert.match(ANIME_VIEW_TOTAL_SQL, /view_count = COALESCE\(view_count, 0\) \+ 1/);
  assert.match(ANIME_VIEW_DAY_SQL, /ON DUPLICATE KEY UPDATE view_count = view_count \+ 1/);
  // favorite_count is dead and must never be written by the view path.
  for (const statement of [ANIME_VIEW_DEDUP_INSERT_SQL, ANIME_VIEW_TOTAL_SQL, ANIME_VIEW_DAY_SQL]) {
    assert.doesNotMatch(statement, /favorite_count/);
  }
});
