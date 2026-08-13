import assert from 'node:assert/strict';
import test from 'node:test';
import { isMangaRank, mangaRankSince } from '../lib/manga-views';

test('漫画榜单参数只接受日周月总', () => {
  assert.equal(isMangaRank('day'), true);
  assert.equal(isMangaRank('week'), true);
  assert.equal(isMangaRank('month'), true);
  assert.equal(isMangaRank('all'), true);
  assert.equal(isMangaRank('latest'), false);
});

test('日周月榜有起始日期，总榜没有', () => {
  assert.match(mangaRankSince('day') || '', /^\d{4}-\d{2}-\d{2}$/);
  assert.match(mangaRankSince('week') || '', /^\d{4}-\d{2}-\d{2}$/);
  assert.match(mangaRankSince('month') || '', /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(mangaRankSince('all'), null);
});
