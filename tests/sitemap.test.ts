import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSitemap } from '../lib/sitemap';


function toIsoString(value: string | Date | undefined) {
  assert.ok(value);
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}


test('生成首页、浏览页、作品页和标签页链接', () => {
  const now = new Date('2026-07-13T00:00:00.000Z');

  const entries = buildSitemap({
    baseUrl: 'https://anime.example.com/',
    now,
    animes: [
      {
        id: 7,
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2025-03-04T00:00:00.000Z',
      },
      {
        id: 8,
        createdAt: 'not-a-date',
        updatedAt: null,
      },
    ],
    tags: [{ id: 3, name: '科幻 & 冒险' }],
  });

  assert.deepEqual(
    entries.map((entry) => entry.url),
    [
      'https://anime.example.com/',
      'https://anime.example.com/browse',
      'https://anime.example.com/watch/7',
      'https://anime.example.com/watch/8',
      'https://anime.example.com/browse?tag=3&tagName=%E7%A7%91%E5%B9%BB%20%26%20%E5%86%92%E9%99%A9',
    ],
  );

  assert.equal(toIsoString(entries[2].lastModified), '2025-03-04T00:00:00.000Z');
  assert.equal(toIsoString(entries[3].lastModified), now.toISOString());
  assert.equal(toIsoString(entries[4].lastModified), now.toISOString());
});

test('拒绝生成超过单文件上限的站点地图', () => {
  const anime = { id: 1, createdAt: null, updatedAt: null };

  assert.throws(
    () =>
      buildSitemap({
        baseUrl: 'https://anime.example.com',
        now: new Date('2026-07-13T00:00:00.000Z'),
        animes: Array.from({ length: 49_999 }, (_, index) => ({ ...anime, id: index + 1 })),
        tags: [],
      }),
    /50,000/,
  );
});
