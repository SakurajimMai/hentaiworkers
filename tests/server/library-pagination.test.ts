import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  listLibraryHistoryPage,
  type LibraryHistoryItem,
  type LibraryHistoryPageRepository,
} from '../../lib/server/library-pagination';
import {
  getPageWindow,
  isCanonicalPageParam,
  parsePageParam,
} from '../../lib/server/shared/pagination';
import {
  normalizeHistoryReturnTo,
  withHistoryError,
} from '../../lib/server/shared/library-navigation';
import {
  buildPublicLoginHref,
  buildPublicRegisterHref,
  normalizePublicNext,
} from '../../lib/server/shared/auth-navigation';

test('library page parameters normalize invalid and repeated values', () => {
  assert.equal(parsePageParam(undefined), 1);
  assert.equal(parsePageParam('0'), 1);
  assert.equal(parsePageParam('-2'), 1);
  assert.equal(parsePageParam('2.5'), 1);
  assert.equal(parsePageParam('2x'), 1);
  assert.equal(parsePageParam(['4', '9']), 4);
  assert.equal(parsePageParam(String(Number.MAX_SAFE_INTEGER + 1)), 1);
  assert.equal(isCanonicalPageParam(undefined, 1), true);
  assert.equal(isCanonicalPageParam('1', 1), false);
  assert.equal(isCanonicalPageParam('0002', 2), false);
  assert.equal(isCanonicalPageParam(['2', '3'], 2), false);
  assert.equal(isCanonicalPageParam('2', 2), true);
});

test('history action navigation strips stale errors and rejects other paths', () => {
  assert.equal(normalizeHistoryReturnTo('/history?page=4&error=1'), '/history?page=4');
  assert.equal(normalizeHistoryReturnTo('/favorites?error=1'), '/history');
  assert.equal(normalizeHistoryReturnTo('//example.com/history'), '/history');
  assert.equal(withHistoryError('/history?page=4&error=old'), '/history?page=4&error=1');
});

test('public login navigation preserves encoded pagination deep links', () => {
  const favoritesHref = '/favorites?animePage=3&mangaPage=4';
  assert.equal(
    buildPublicLoginHref(favoritesHref),
    '/login?next=%2Ffavorites%3FanimePage%3D3%26mangaPage%3D4',
  );
  assert.equal(
    buildPublicLoginHref(favoritesHref, { error: 'rate' }),
    '/login?error=rate&next=%2Ffavorites%3FanimePage%3D3%26mangaPage%3D4',
  );
  assert.equal(
    buildPublicLoginHref(normalizeHistoryReturnTo('/history?page=5&error=1')),
    '/login?next=%2Fhistory%3Fpage%3D5',
  );
  assert.equal(
    buildPublicRegisterHref(favoritesHref, { error: 'email' }),
    '/register?error=email&next=%2Ffavorites%3FanimePage%3D3%26mangaPage%3D4',
  );
});

test('public login navigation rejects external and admin destinations', () => {
  assert.equal(normalizePublicNext('//example.com', '/favorites'), '/favorites');
  assert.equal(normalizePublicNext('/\\example.com', '/favorites'), '/favorites');
  assert.equal(normalizePublicNext('/admin/users', '/favorites'), '/favorites');
  assert.equal(normalizePublicNext(['/history', '/favorites'], '/favorites'), '/favorites');
  assert.equal(normalizePublicNext(undefined, '/favorites'), '/favorites');
  assert.equal(normalizePublicNext('/history?page=2', '/favorites'), '/history?page=2');
});

test('library page windows clamp totals, pages and page sizes', () => {
  assert.deepEqual(getPageWindow(99, 0, 20), {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    offset: 0,
  });
  assert.equal(getPageWindow(1, 1, 20).totalPages, 1);
  assert.equal(getPageWindow(1, 20, 20).totalPages, 1);
  assert.equal(getPageWindow(1, 21, 20).totalPages, 2);
  assert.deepEqual(getPageWindow(99, 65, 20), {
    page: 4,
    pageSize: 20,
    total: 65,
    totalPages: 4,
    offset: 60,
  });
  assert.equal(getPageWindow(1, 1, 999).pageSize, 100);
});

class MemoryHistoryRepository implements LibraryHistoryPageRepository {
  readonly calls: Array<{ limit: number; offset: number }> = [];

  constructor(private readonly rows: readonly LibraryHistoryItem[]) {}

  async listPageForUser(_userId: number, requestedPage: number, pageSize: number) {
    const window = getPageWindow(requestedPage, this.rows.length, pageSize);
    this.calls.push({ limit: window.pageSize, offset: window.offset });
    return {
      items: this.rows.slice(window.offset, window.offset + window.pageSize),
      page: window.page,
      pageSize: window.pageSize,
      total: window.total,
      totalPages: window.totalPages,
    };
  }
}

function historyRows(total: number): LibraryHistoryItem[] {
  return Array.from({ length: total }, (_, index) => ({
    kind: 'anime' as const,
    recordId: total - index,
    animeId: total - index,
    title: `Anime ${total - index}`,
    cover: null,
    positionSeconds: 10,
    durationSeconds: 100,
    completed: false,
    activityAt: new Date(1_800_000_000_000 - index * 1_000).toISOString(),
  }));
}

test('history pagination keeps every item reachable beyond the old 100 row cap', async () => {
  const repository = new MemoryHistoryRepository(historyRows(121));
  const pages = await Promise.all(
    Array.from({ length: 7 }, (_, index) =>
      listLibraryHistoryPage(7, index + 1, 20, repository)),
  );
  const ids = pages.flatMap((page) => page.items.map((item) => item.recordId));

  assert.equal(pages[0]?.total, 121);
  assert.equal(pages[0]?.totalPages, 7);
  assert.equal(pages.at(-1)?.items.length, 1);
  assert.equal(ids.length, 121);
  assert.equal(new Set(ids).size, 121);
});

test('history pagination queries the clamped last page after a deletion', async () => {
  const repository = new MemoryHistoryRepository(historyRows(40));
  const page = await listLibraryHistoryPage(7, 3, 20, repository);
  assert.equal(page.page, 2);
  assert.deepEqual(repository.calls, [{ limit: 20, offset: 20 }]);
});

test('MariaDB history query uses a unified deterministic timeline', async () => {
  const source = await readFile(
    new URL('../../lib/server/library-pagination.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /UNION ALL/);
  assert.match(source, /ORDER BY activity_at DESC, kind ASC, record_id DESC/);
  assert.match(source, /LIMIT \? OFFSET \?/);
  const dbSource = await readFile(new URL('../../lib/db.ts', import.meta.url), 'utf8');
  assert.match(dbSource, /START TRANSACTION READ ONLY/);
});

test('library pagination migration adds all deterministic composite indexes', async () => {
  const migration = await readFile(
    new URL('../../drizzle/migrations/0019-library-pagination-indexes.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /user_list_items[\s\S]*\(list_id, created_at, id\)/);
  assert.match(migration, /manga_favorites[\s\S]*\(user_id, created_at, id\)/);
  assert.match(migration, /user_watch_progress[\s\S]*\(user_id, last_watched_at, id\)/);
  assert.match(migration, /manga_reading_progress[\s\S]*\(user_id, last_read_at, id\)/);
  assert.match(migration, /information_schema\.statistics/);
  assert.equal((migration.match(/^PREPARE library_index_statement/gm) ?? []).length, 4);
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE)\b/i);
});
