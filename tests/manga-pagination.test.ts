import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMangaListHref } from '../components/manga-pagination';

test('漫画分页在标签筛选时保留 tag 并翻页', () => {
  assert.equal(buildMangaListHref(1, undefined, '巨乳'), '/manga?tag=%E5%B7%A8%E4%B9%B3');
  assert.equal(buildMangaListHref(2, undefined, '巨乳'), '/manga?page=2&tag=%E5%B7%A8%E4%B9%B3');
  assert.equal(buildMangaListHref(3, '老婆', '后宫'), '/manga?page=3&q=%E8%80%81%E5%A9%86&tag=%E5%90%8E%E5%AE%AB');
  assert.equal(buildMangaListHref(1, undefined, undefined, 'week'), '/manga?rank=week');
});
