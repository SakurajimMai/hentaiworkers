import type { PageResult } from '../../shared/pagination';

export type FavoriteRecord = Readonly<{
  userId: number;
  animeId: number;
  createdAt: string;
}>;

export type FavoriteAnimeListItem = Readonly<{
  id: number;
  title: string;
  cover: string | null;
  viewCount: number | null;
  titleEnglish: string | null;
  favoritedAt: string;
}>;

export type FavoriteAnimePage = PageResult<FavoriteAnimeListItem>;

export type FavoritePageRequest = Readonly<{
  page: number;
  pageSize: number;
}>;

export interface FavoritesRepository {
  listAnimeIds(userId: number): Promise<ReadonlyArray<number>>;
  listWithAnime(userId: number): Promise<ReadonlyArray<FavoriteAnimeListItem>>;
  listWithAnimePage(
    userId: number,
    request: FavoritePageRequest,
  ): Promise<FavoriteAnimePage>;
  isFavorite(userId: number, animeId: number): Promise<boolean>;
  add(userId: number, animeId: number): Promise<void>;
  remove(userId: number, animeId: number): Promise<void>;
}
