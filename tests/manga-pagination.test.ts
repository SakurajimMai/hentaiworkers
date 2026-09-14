import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMangaListHref } from '../components/manga-pagination';
import { mangaTagHref } from '../lib/manga-tags';

test('漫画分页在标签筛选时保留 tag 并翻页', () => {
  assert.equal(buildMangaListHref(1, undefined, '巨乳'), '/manga?tag=%E5%B7%A8%E4%B9%B3');
  assert.equal(buildMangaListHref(2, undefined, '巨乳'), '/manga?page=2&tag=%E5%B7%A8%E4%B9%B3');
  assert.equal(buildMangaListHref(3, '老婆', '后宫'), '/manga?page=3&q=%E8%80%81%E5%A9%86&tag=%E5%90%8E%E5%AE%AB');
  assert.equal(buildMangaListHref(1, undefined, undefined, 'week'), '/manga?rank=week');
});

test('manga listing hrefs encode exactly like the sitemap and the tag chips', () => {
  // URLSearchParams would render a space as `+`, making the canonical disagree with the URL the
  // sitemap submits and the tag chip links to.
  assert.equal(buildMangaListHref(1, undefined, '全彩 CG'), `/manga?tag=${encodeURIComponent('全彩 CG')}`);
  assert.equal(buildMangaListHref(1, undefined, '全彩 CG'), mangaTagHref('全彩 CG'));
  assert.equal(buildMangaListHref(1, undefined, "Girls' Love"), mangaTagHref("Girls' Love"));
  assert.equal(buildMangaListHref(1, undefined, 'NTR(寝取られ)'), mangaTagHref('NTR(寝取られ)'));
  assert.equal(buildMangaListHref(2, undefined, '全彩 CG'), `/manga?page=2&tag=${encodeURIComponent('全彩 CG')}`);
  assert.equal(buildMangaListHref(1), '/manga');
  assert.equal(buildMangaListHref(3, undefined, undefined, 'day'), '/manga?page=3&rank=day');
});
