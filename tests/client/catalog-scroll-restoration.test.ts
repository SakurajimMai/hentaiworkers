import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyRestoredScrollY,
  CATALOG_RESTORE_SCROLL_OPTIONS,
  CATALOG_SCROLL_STORAGE_PREFIX,
  catalogLocationKey,
  decideScrollRestoreAttempt,
  isHistoryBackTarget,
  isManagedScrollPath,
  parseStoredScrollY,
  rememberScrollEntry,
  shouldRestoreCatalogScroll,
  takeHistoryTraverse,
  writeCatalogScrollY,
  noteHistoryTraverse,
} from '../../lib/client/catalog-scroll-restoration';

test('catalog keys keep search so paginated manga lists restore independently', () => {
  assert.equal(catalogLocationKey('/manga', ''), '/manga');
  assert.equal(catalogLocationKey('/manga', 'page=2&rank=day'), '/manga?page=2&rank=day');
  assert.equal(catalogLocationKey('/manga', '?q=foo'), '/manga?q=foo');
});

test('history traverse restores catalog scroll and skips reader and hash targets', () => {
  assert.equal(
    shouldRestoreCatalogScroll({ traverse: true, pathname: '/manga', hash: '' }),
    true,
  );
  assert.equal(
    shouldRestoreCatalogScroll({ traverse: false, pathname: '/manga', hash: '' }),
    false,
  );
  assert.equal(
    shouldRestoreCatalogScroll({
      traverse: true,
      pathname: '/manga/18/read/1',
      hash: '',
    }),
    false,
  );
  assert.equal(
    shouldRestoreCatalogScroll({ traverse: true, pathname: '/manga', hash: '#main-content' }),
    false,
  );
  assert.equal(isManagedScrollPath('/manga/18'), true);
  assert.equal(isManagedScrollPath('/manga/18/read/3'), false);
});

test('detail back uses history only when returning to the same catalog path', () => {
  assert.equal(isHistoryBackTarget('/manga?page=3&rank=week', '/manga'), true);
  assert.equal(isHistoryBackTarget('/browse?sort=popular', '/browse'), true);
  assert.equal(isHistoryBackTarget('/manga/18', '/manga/18'), true);
  assert.equal(isHistoryBackTarget('/', '/manga'), false);
  assert.equal(isHistoryBackTarget('/favorites', '/manga'), false);
  assert.equal(isHistoryBackTarget(null, '/manga'), false);
});

test('stored scroll values reject zero and garbage', () => {
  assert.equal(parseStoredScrollY('864'), 864);
  assert.equal(parseStoredScrollY('0'), null);
  assert.equal(parseStoredScrollY('-12'), null);
  assert.equal(parseStoredScrollY('12.4'), 12);
  assert.equal(parseStoredScrollY('nope'), null);
  assert.equal(parseStoredScrollY(null), null);
});

test('scroll restore waits for catalog height then lands instantly', () => {
  assert.deepEqual(
    decideScrollRestoreAttempt({
      savedY: 800,
      scrollHeight: 400,
      viewport: 700,
      elapsedMs: 16,
    }),
    { top: 0, continue: true },
  );
  assert.deepEqual(
    decideScrollRestoreAttempt({
      savedY: 800,
      scrollHeight: 2400,
      viewport: 700,
      elapsedMs: 32,
    }),
    { top: 800, continue: false },
  );
  assert.deepEqual(
    decideScrollRestoreAttempt({
      savedY: 800,
      scrollHeight: 900,
      viewport: 700,
      elapsedMs: 1500,
    }),
    { top: 200, continue: false },
  );

  const calls: Array<{ top: number; behavior: string }> = [];
  applyRestoredScrollY((options) => calls.push(options), 640);
  assert.deepEqual(calls, [{ ...CATALOG_RESTORE_SCROLL_OPTIONS, top: 640 }]);
  assert.equal(CATALOG_RESTORE_SCROLL_OPTIONS.behavior, 'instant');
});

test('scroll storage evicts the oldest catalog entry', () => {
  const storage = memoryStorage();
  writeCatalogScrollY(storage, '/manga', 120);
  writeCatalogScrollY(storage, '/manga?page=2', 480);
  assert.equal(storage.getItem(`${CATALOG_SCROLL_STORAGE_PREFIX}/manga`), '120');
  writeCatalogScrollY(storage, '/manga', 0);
  assert.equal(storage.getItem(`${CATALOG_SCROLL_STORAGE_PREFIX}/manga`), null);

  const overflow = rememberScrollEntry(['/a', '/b'], '/c', 2);
  assert.deepEqual(overflow.index, ['/c', '/a']);
  assert.equal(overflow.evicted, '/b');
});

test('traverse flag is consumed once so push navigations stay at the top', () => {
  assert.equal(takeHistoryTraverse(), false);
  noteHistoryTraverse();
  assert.equal(takeHistoryTraverse(), true);
  assert.equal(takeHistoryTraverse(), false);
});

test('site shell restores catalog scroll instead of remounting a home skeleton', () => {
  const restoration = readFileSync(
    new URL('../../components/catalog-scroll-restoration.tsx', import.meta.url),
    'utf8',
  );
  const layout = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8');
  const mangaDetail = readFileSync(
    new URL('../../app/(site)/manga/[slug]/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(restoration, /takeHistoryTraverse/);
  assert.match(restoration, /applyRestoredScrollY/);
  assert.match(layout, /CatalogScrollRestoration/);
  // The back link is history-aware and, on a direct visit, points at the catalog page that
  // actually holds this work rather than page 1.
  assert.match(mangaDetail, /HistoryBackLink href=\{catalogHref\}/);
  assert.match(mangaDetail, /findMangaCatalogPage\(manga\.id\)/);
  assert.doesNotMatch(mangaDetail, /<Link href="\/manga" className="mb-7/);
  assert.doesNotMatch(mangaDetail, /HistoryBackLink href="\/manga"/);
  assert.equal(
    existsSync(new URL('../../app/(site)/loading.tsx', import.meta.url)),
    false,
  );
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}
