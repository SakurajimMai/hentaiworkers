import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  clampReaderPage,
  getReaderAdRenderPolicy,
  getInitialReaderPages,
  getReaderImageRequestPolicy,
  getStoredReaderPage,
  isReaderViewportTransition,
  getReaderPrefetchPages,
  READER_RESTORE_SCROLL_OPTIONS,
  selectActiveReaderPage,
  shouldSyncReaderProgress,
} from '../components/manga-reader-policy';

const readerCss = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('reader restore values are bounded without silently accepting invalid storage', () => {
  assert.equal(getStoredReaderPage('200', 280), 200);
  assert.equal(getStoredReaderPage('0', 280), 0);
  assert.equal(getStoredReaderPage('280', 280), null);
  assert.equal(getStoredReaderPage('-1', 280), null);
  assert.equal(getStoredReaderPage('4.5', 280), null);
  assert.equal(getStoredReaderPage('not-a-page', 280), null);
  assert.equal(clampReaderPage(999, 280), 279);
  assert.equal(clampReaderPage(-4, 280), 0);
});

test('initial candidates include a small neighborhood with one critical image', () => {
  assert.deepEqual(getInitialReaderPages(0, 292), [0, 1, 2]);
  assert.deepEqual(getInitialReaderPages(200, 280), [200, 201, 199, 202]);
  assert.deepEqual(getInitialReaderPages(0, 0), []);

  const policies = [0, 1, 2].map((index) => getReaderImageRequestPolicy(index === 0));
  assert.equal(policies.filter((policy) => policy.fetchPriority === 'high').length, 1);
  assert.deepEqual(policies[0], { loading: 'eager', fetchPriority: 'high' });
  assert.deepEqual(policies[1], { loading: 'eager', fetchPriority: 'low' });
});

test('offscreen prefetch intersections cannot advance the actual reader page', () => {
  const active = selectActiveReaderPage(
    [
      { index: 0, isIntersecting: true, top: 0, bottom: 390 },
      // This is inside a prefetch root margin but outside the real viewport.
      { index: 5, isIntersecting: true, top: 1_100, bottom: 1_490 },
    ],
    844,
    0,
  );
  assert.equal(active, 0);
});

test('reader window follows direction and stays bounded at chapter edges', () => {
  assert.deepEqual(getReaderPrefetchPages(20, 292, 1), [21, 22, 23, 24, 19]);
  assert.deepEqual(getReaderPrefetchPages(20, 292, -1), [19, 18, 17, 16, 21]);
  assert.deepEqual(getReaderPrefetchPages(0, 292, -1), [1]);
  assert.deepEqual(getReaderPrefetchPages(291, 292, 1), [290]);
});

test('reader restore bypasses global smooth scrolling and lands immediately', () => {
  assert.deepEqual(READER_RESTORE_SCROLL_OPTIONS, {
    behavior: 'instant',
    block: 'start',
  });
});

test('a 292-page square chapter remains on P1 at scrollY zero', () => {
  const visible = Array.from({ length: 292 }, (_, index) => ({
    index,
    isIntersecting: index < 3,
    top: index * 390,
    bottom: (index + 1) * 390,
  }));
  assert.equal(selectActiveReaderPage(visible, 844, 0), 0);
});

test('actual viewport movement selects the page crossing the reading line', () => {
  assert.equal(
    selectActiveReaderPage(
      [
        { index: 0, isIntersecting: true, top: -300, bottom: 90 },
        { index: 1, isIntersecting: true, top: 90, bottom: 480 },
        { index: 2, isIntersecting: true, top: 480, bottom: 870 },
      ],
      844,
      0,
    ),
    1,
  );
});

test('cloud progress is enabled only for a resolved authenticated session', () => {
  assert.equal(shouldSyncReaderProgress({ available: true, authenticated: true }), true);
  assert.equal(shouldSyncReaderProgress({ available: true, authenticated: false }), false);
  assert.equal(shouldSyncReaderProgress({ available: false, authenticated: true }), false);
});

test('cloud progress starts only after the viewport selects a different page', () => {
  assert.equal(isReaderViewportTransition(0, null), false);
  assert.equal(isReaderViewportTransition(0, -1), false);
  assert.equal(isReaderViewportTransition(0, 0), false);
  assert.equal(isReaderViewportTransition(0, 1), true);
  assert.equal(isReaderViewportTransition(200, 199), true);
});

test('enabled top ads reserve their slot before mounting network content', () => {
  assert.deepEqual(getReaderAdRenderPolicy('', false), {
    reserveSlot: false,
    mountContent: false,
  });
  assert.deepEqual(getReaderAdRenderPolicy('<div>ad</div>', false), {
    reserveSlot: true,
    mountContent: false,
  });
  assert.deepEqual(getReaderAdRenderPolicy('<div>ad</div>', true), {
    reserveSlot: true,
    mountContent: true,
  });
});

test('offscreen reader placeholders keep their responsive aspect-ratio height', () => {
  const imageRule = readerCss.match(/\.reader-image\s*\{([^}]*)\}/)?.[1] ?? '';
  const pendingRule = readerCss.match(/\.reader-image-pending\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.notEqual(imageRule, '');
  assert.doesNotMatch(imageRule, /content-visibility|contain-intrinsic-size/);
  assert.match(pendingRule, /aspect-ratio:\s*900\s*\/\s*1280/);
});
