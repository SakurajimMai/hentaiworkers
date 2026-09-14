import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_SITEMAP_URLS,
  SITEMAP_CHUNK_SIZE,
  buildSitemapIndex,
  buildSitemapSection,
  buildSitemapSections,
  chunkSitemapEntries,
  parseSitemapSectionName,
  renderSitemapIndex,
  renderUrlSet,
  type SitemapSource,
} from '../lib/sitemap';

const source: SitemapSource = {
  animes: [
    { id: 7, createdAt: '2024-01-02T00:00:00.000Z', updatedAt: '2025-03-04T00:00:00.000Z', cover: 'https://image.example/7.jpg' },
    { id: 8, createdAt: 'not-a-date', updatedAt: null, cover: '/relative.jpg' },
  ],
  mangas: [{ id: 11, slug: 'demo', updatedAt: '2026-01-02T00:00:00.000Z', coverUrl: 'https://image.example/m11.jpg' }],
  tags: [{ id: 3, name: '科幻 & 冒险' }],
  mangaTags: ['NTR', ' 巨乳 ', 'NTR', ''],
};

test('sitemap index lists one chunked file per non-empty section with the newest lastmod', () => {
  const index = buildSitemapIndex('https://anime.example.com/', source);
  assert.deepEqual(
    index.map((entry) => entry.url),
    [
      'https://anime.example.com/sitemaps/pages.xml',
      'https://anime.example.com/sitemaps/animes-1.xml',
      'https://anime.example.com/sitemaps/mangas-1.xml',
      'https://anime.example.com/sitemaps/tags-1.xml',
      'https://anime.example.com/sitemaps/manga-tags-1.xml',
    ],
  );
  assert.equal(index[0].lastModified, undefined, 'static hubs do not fake a modification time');
  assert.equal(index[1].lastModified?.toISOString(), '2025-03-04T00:00:00.000Z');
  assert.equal(index[2].lastModified?.toISOString(), '2026-01-02T00:00:00.000Z');

  const empty = buildSitemapIndex('https://anime.example.com', { animes: [], mangas: [], tags: [], mangaTags: [] });
  assert.deepEqual(empty.map((entry) => entry.url), ['https://anime.example.com/sitemaps/pages.xml']);
});

test('sections contain detail pages with cover images, tag listings without raw & and curated manga tags', () => {
  const files = buildSitemapSections('https://anime.example.com', source);
  const byName = Object.fromEntries(files.map((file) => [file.name, file]));

  assert.deepEqual(byName['pages.xml'].entries.map((entry) => entry.url), [
    'https://anime.example.com/',
    'https://anime.example.com/browse',
    'https://anime.example.com/manga',
    'https://anime.example.com/privacy',
    'https://anime.example.com/terms',
  ]);
  const animes = byName['animes-1.xml'].entries;
  assert.equal(animes[0].url, 'https://anime.example.com/watch/7');
  assert.deepEqual(animes[0].images, ['https://image.example/7.jpg']);
  assert.equal(animes[0].lastModified?.toISOString(), '2025-03-04T00:00:00.000Z');
  assert.equal(animes[1].lastModified, undefined, 'invalid dates are omitted instead of faked');
  assert.deepEqual(animes[1].images, [], 'only absolute http(s) covers enter the image sitemap');
  assert.deepEqual(byName['mangas-1.xml'].entries[0], {
    url: 'https://anime.example.com/manga/11',
    lastModified: new Date('2026-01-02T00:00:00.000Z'),
    changeFrequency: 'weekly',
    priority: 0.8,
    images: ['https://image.example/m11.jpg'],
  });
  assert.deepEqual(byName['tags-1.xml'].entries.map((entry) => entry.url), ['https://anime.example.com/browse?tag=3']);
  assert.deepEqual(
    byName['manga-tags-1.xml'].entries.map((entry) => entry.url),
    ['https://anime.example.com/manga?tag=NTR', 'https://anime.example.com/manga?tag=%E5%B7%A8%E4%B9%B3'],
  );
  for (const file of files) {
    assert.equal(file.entries.every((entry) => !entry.url.includes('&')), true);
  }
});

test('large catalogs are chunked below the per-file limit and addressed by section name', () => {
  const anime = { id: 1, createdAt: null, updatedAt: null, cover: null };
  const big: SitemapSource = {
    animes: Array.from({ length: MAX_SITEMAP_URLS + 1 }, (_, index) => ({ ...anime, id: index + 1 })),
    mangas: [],
    tags: [],
    mangaTags: [],
  };
  const files = buildSitemapSections('https://anime.example.com', big);
  const animeFiles = files.filter((file) => file.name.startsWith('animes-'));
  assert.equal(animeFiles.length, Math.ceil((MAX_SITEMAP_URLS + 1) / SITEMAP_CHUNK_SIZE));
  assert.ok(animeFiles.every((file) => file.entries.length <= SITEMAP_CHUNK_SIZE));
  assert.equal(animeFiles.at(-1)?.entries.at(-1)?.url, `https://anime.example.com/watch/${MAX_SITEMAP_URLS + 1}`);

  const second = buildSitemapSection('https://anime.example.com', big, { section: 'animes', index: 2 });
  assert.equal(second?.entries[0].url, `https://anime.example.com/watch/${SITEMAP_CHUNK_SIZE + 1}`);
  assert.equal(buildSitemapSection('https://anime.example.com', big, { section: 'animes', index: 99 }), null);
  assert.equal(buildSitemapSection('https://anime.example.com', big, { section: 'mangas', index: 1 }), null);
  assert.equal(chunkSitemapEntries([1, 2, 3], 2).length, 2);
  assert.throws(() => chunkSitemapEntries([1], MAX_SITEMAP_URLS + 1), RangeError);
});

test('section names parse strictly', () => {
  assert.deepEqual(parseSitemapSectionName('pages.xml'), { section: 'pages', index: 1 });
  assert.deepEqual(parseSitemapSectionName('animes-1.xml'), { section: 'animes', index: 1 });
  assert.deepEqual(parseSitemapSectionName('manga-tags-3.xml'), { section: 'manga-tags', index: 3 });
  for (const bad of ['pages-1.xml', 'animes.xml', 'animes-0.xml', 'users-1.xml', 'animes-1', '../x.xml', 'ANIMES-1.xml']) {
    assert.equal(parseSitemapSectionName(bad), null, bad);
  }
  // Leading zeros would otherwise serve an identical file under a second long-cached URL.
  for (const padded of ['animes-01.xml', 'animes-001.xml', 'tags-0010.xml', 'manga-tags-03.xml']) {
    assert.equal(parseSitemapSectionName(padded), null, padded);
  }
});

test('xml renderers escape values, include image extensions only when needed and cap file size', () => {
  const xml = renderUrlSet([
    { url: 'https://anime.example.com/browse?tag=3&x=<1>', lastModified: new Date('2026-01-02T00:00:00.000Z'), changeFrequency: 'weekly', priority: 0.6 },
    { url: 'https://anime.example.com/watch/7', images: ['https://image.example/7.jpg?a=1&b=2'] },
  ]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1">/);
  assert.match(xml, /<loc>https:\/\/anime\.example\.com\/browse\?tag=3&amp;x=&lt;1&gt;<\/loc><lastmod>2026-01-02T00:00:00\.000Z<\/lastmod><changefreq>weekly<\/changefreq><priority>0\.6<\/priority>/);
  assert.match(xml, /<image:image><image:loc>https:\/\/image\.example\/7\.jpg\?a=1&amp;b=2<\/image:loc><\/image:image>/);
  assert.doesNotMatch(renderUrlSet([{ url: 'https://anime.example.com/' }]), /xmlns:image/);
  assert.throws(
    () => renderUrlSet(Array.from({ length: MAX_SITEMAP_URLS + 1 }, (_, index) => ({ url: `https://anime.example.com/watch/${index}` }))),
    /50,000/,
  );

  const index = renderSitemapIndex([
    { url: 'https://anime.example.com/sitemaps/pages.xml' },
    { url: 'https://anime.example.com/sitemaps/animes-1.xml', lastModified: new Date('2026-01-02T00:00:00.000Z') },
  ]);
  assert.match(index, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(index, /<sitemap><loc>https:\/\/anime\.example\.com\/sitemaps\/pages\.xml<\/loc><\/sitemap>/);
  assert.match(index, /<sitemap><loc>https:\/\/anime\.example\.com\/sitemaps\/animes-1\.xml<\/loc><lastmod>2026-01-02T00:00:00\.000Z<\/lastmod><\/sitemap>/);
});
