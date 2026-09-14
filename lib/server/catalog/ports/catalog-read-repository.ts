import type {
  AnimeDetail,
  AnimeListItem,
  AnimeSimilarItem,
  CatalogListQuery,
  CatalogPage,
  SitemapData,
  TagSummary,
} from '../domain/models';

export type CatalogPageLookup = Readonly<{
  animeId: number;
  pageSize: number;
}>;

export type TitlePrefixQuery = Readonly<{
  /** Already-escaped LIKE pattern body without trailing %. */
  prefix: string;
  excludeIds: readonly number[];
  limit: number;
}>;

export type SharedTagsQuery = Readonly<{
  tagIds: readonly number[];
  excludeIds: readonly number[];
  limit: number;
}>;

export type PopularQuery = Readonly<{
  excludeIds: readonly number[];
  limit: number;
}>;

export interface CatalogReadRepository {
  list(input: CatalogListQuery): Promise<CatalogPage>;
  /**
   * Row-level detail. `favoriteCount` is always `null` here: the stored
   * `animes.favorite_count` column is dead, so the real number is composed by
   * the application layer through `countFavorites`.
   */
  getById(id: number): Promise<AnimeDetail | null>;
  /** Live favourite count from the system favourites lists. */
  countFavorites(animeId: number): Promise<number>;
  /** 1-based page of the default `latest` listing that contains this work. */
  findCatalogPage(input: CatalogPageLookup): Promise<number>;
  listTags(): Promise<ReadonlyArray<TagSummary>>;
  getSitemapData(): Promise<SitemapData>;
  listByTitlePrefix(input: TitlePrefixQuery): Promise<ReadonlyArray<AnimeSimilarItem>>;
  listBySharedTags(input: SharedTagsQuery): Promise<ReadonlyArray<AnimeSimilarItem>>;
  listPopular(input: PopularQuery): Promise<ReadonlyArray<AnimeSimilarItem>>;
  listTagIdsForAnime(animeId: number): Promise<ReadonlyArray<number>>;
}

/** Convenience re-export for list item typing in adapters. */
export type { AnimeListItem };
