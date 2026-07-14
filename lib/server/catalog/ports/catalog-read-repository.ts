import type {
  AnimeDetail,
  AnimeListItem,
  AnimeSimilarItem,
  CatalogListQuery,
  CatalogPage,
  SitemapData,
  TagSummary,
} from '../domain/models';

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
  getById(id: number): Promise<AnimeDetail | null>;
  listTags(): Promise<ReadonlyArray<TagSummary>>;
  getSitemapData(): Promise<SitemapData>;
  listByTitlePrefix(input: TitlePrefixQuery): Promise<ReadonlyArray<AnimeSimilarItem>>;
  listBySharedTags(input: SharedTagsQuery): Promise<ReadonlyArray<AnimeSimilarItem>>;
  listPopular(input: PopularQuery): Promise<ReadonlyArray<AnimeSimilarItem>>;
  listTagIdsForAnime(animeId: number): Promise<ReadonlyArray<number>>;
}

/** Convenience re-export for list item typing in adapters. */
export type { AnimeListItem };
