import assert from 'node:assert/strict';
import test from 'node:test';
import {
  absoluteMediaUrl,
  followOnlyRobots,
  indexableRobots,
  isoDate,
  noIndexRobots,
} from '../lib/seo';
import {
  LISTING_PARAMS,
  buildListingPaginationHref,
} from '../components/pagination-model';

function withSiteUrl<T>(siteUrl: string, run: () => T): T {
  const previous = process.env.SITE_URL;
  process.env.SITE_URL = siteUrl;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previous;
  }
}

test('zone-less catalog timestamps are read as UTC, not as server local time', () => {
  // animes.created_at is a plain `YYYY-MM-DD HH:MM:SS` text column.
  assert.equal(isoDate('2026-08-05 15:07:55'), '2026-08-05T15:07:55.000Z');
  assert.equal(isoDate('2026-08-05T15:07:55'), '2026-08-05T15:07:55.000Z');
  assert.equal(isoDate('2026-08-05 15:07:55.250'), '2026-08-05T15:07:55.250Z');
  // Values that already carry a zone, or a real Date, are passed through untouched.
  assert.equal(isoDate('2026-08-05T15:07:55.000Z'), '2026-08-05T15:07:55.000Z');
  assert.equal(isoDate(new Date('2026-08-05T15:07:55.000Z')), '2026-08-05T15:07:55.000Z');
  assert.equal(isoDate('not a date'), undefined);
  assert.equal(isoDate(null), undefined);
  assert.equal(isoDate(undefined), undefined);
});

test('structured data media URLs are absolute http(s) or omitted', () => {
  withSiteUrl('https://site.example', () => {
    // A relative catalog path still has to produce a usable contentUrl for VideoObject.
    assert.equal(absoluteMediaUrl('/media/a.mp4'), 'https://site.example/media/a.mp4');
    assert.equal(absoluteMediaUrl('media/a.mp4'), 'https://site.example/media/a.mp4');
    assert.equal(absoluteMediaUrl('https://cdn.example/a.mp4'), 'https://cdn.example/a.mp4');
    assert.equal(absoluteMediaUrl('//cdn.example/a.mp4'), 'https://cdn.example/a.mp4');
    assert.equal(absoluteMediaUrl('javascript:alert(1)'), undefined);
    assert.equal(absoluteMediaUrl('   '), undefined);
    assert.equal(absoluteMediaUrl(null), undefined);
  });
});

test('indexable pages keep the googleBot preview directives the root layout advertises', () => {
  // Next replaces robots per layer instead of merging, so listing pages must spread these.
  assert.equal(indexableRobots.index, true);
  assert.equal(indexableRobots.googleBot['max-image-preview'], 'large');
  assert.equal(indexableRobots.googleBot['max-snippet'], -1);
  assert.equal(indexableRobots.googleBot['max-video-preview'], -1);
  assert.deepEqual(followOnlyRobots, { index: false, follow: true });
  assert.deepEqual(noIndexRobots, { index: false, follow: false });
});

test('pagination links keep listing params and drop display-only and campaign params', () => {
  assert.deepEqual([...LISTING_PARAMS], ['tag', 'sort', 'search', 'q', 'rank']);

  assert.equal(
    buildListingPaginationHref('/browse', { tag: '3', tagName: 'X', utm_source: 'tw' }, 2),
    '/browse?tag=3&page=2',
    'tagName and utm params never enter a crawlable URL',
  );
  assert.equal(
    buildListingPaginationHref('/browse', { tag: '3', sort: 'popular' }, 1),
    '/browse?tag=3&sort=popular',
    'page 1 is the bare listing URL, matching its canonical',
  );
  assert.equal(buildListingPaginationHref('/manga', { rank: 'day', fbclid: 'abc' }, 4), '/manga?rank=day&page=4');
  assert.equal(buildListingPaginationHref('/manga', {}, 1), '/manga');
  assert.equal(buildListingPaginationHref('/manga', { tag: '' }, 1), '/manga', 'empty values are dropped');
  assert.equal(buildListingPaginationHref('/browse', { tag: '3' }, 0), '/browse?tag=3', 'invalid pages fall back to 1');
});
