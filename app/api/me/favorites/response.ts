import type { FavoriteAnimeListItem } from '@/lib/server/identity/ports/favorites-repository';
import type { MangaFavoriteItem } from '@/lib/server/manga-favorites';

export type MobileFavoritesResponse = Readonly<{
  animes: ReadonlyArray<Readonly<{
    id: number;
    title: string;
    cover: string | null;
    favoritedAt: string;
  }>>;
  mangas: ReadonlyArray<Readonly<{
    id: number;
    title: string;
    coverUrl: string | null;
    favoritedAt: string;
  }>>;
}>;

export function buildMobileFavoritesResponse(
  animes: ReadonlyArray<FavoriteAnimeListItem>,
  mangas: ReadonlyArray<MangaFavoriteItem>,
): MobileFavoritesResponse {
  return {
    animes: animes.map((item) => ({
      id: item.id,
      title: item.title,
      cover: item.cover,
      favoritedAt: item.favoritedAt,
    })),
    mangas: mangas.map((item) => ({
      id: item.mangaId,
      title: item.title,
      coverUrl: item.coverUrl,
      favoritedAt: item.favoritedAt,
    })),
  };
}
