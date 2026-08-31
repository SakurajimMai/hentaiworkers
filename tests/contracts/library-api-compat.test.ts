import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMobileFavoritesResponse } from '../../app/api/me/favorites/response';

test('mobile favorites endpoint keeps its full-list response contract', async () => {
  const route = await readFile(
    new URL('../../app/api/me/favorites/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(route, /getFavoritesService\(\)\.listMine\(\)/);
  assert.match(route, /listMangaFavorites\(\)/);
  assert.match(route, /buildMobileFavoritesResponse\(animes, mangas\)/);
  assert.doesNotMatch(route, /listMinePage|listMangaFavoritesPage/);
});

test('mobile favorites response keeps its item field names and values', () => {
  const response = buildMobileFavoritesResponse(
    [{
      id: 7,
      title: 'Anime title',
      cover: '/anime.webp',
      viewCount: 99,
      titleEnglish: 'Ignored English title',
      favoritedAt: '2026-08-31T00:00:00.000Z',
    }],
    [{
      mangaId: 9,
      slug: 'manga-title',
      title: 'Manga title',
      coverUrl: '/manga.webp',
      pageCount: 42,
      favoritedAt: '2026-08-30T00:00:00.000Z',
    }],
  );

  assert.deepEqual(response, {
    animes: [{
      id: 7,
      title: 'Anime title',
      cover: '/anime.webp',
      favoritedAt: '2026-08-31T00:00:00.000Z',
    }],
    mangas: [{
      id: 9,
      title: 'Manga title',
      coverUrl: '/manga.webp',
      favoritedAt: '2026-08-30T00:00:00.000Z',
    }],
  });
});
