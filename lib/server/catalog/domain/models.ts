export type SortType = 'latest' | 'popular';

export type CatalogListQuery = Readonly<{
  page?: number;
  limit?: number;
  tagId?: number;
  search?: string;
  sort?: SortType;
  activeOnly?: boolean;
}>;

export type AnimeListItem = Readonly<{
  id: number;
  title: string;
  cover: string | null;
  viewCount: number | null;
  titleEnglish: string | null;
}>;

export type Pagination = Readonly<{
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}>;

export type CatalogPage = Readonly<{
  data: readonly AnimeListItem[];
  pagination: Pagination;
}>;

export type TagSummary = Readonly<{
  id: number;
  name: string;
}>;

export type Tag = Readonly<{
  id: number;
  name: string;
  description: string | null;
}>;

export type AnimeDetail = Readonly<{
  id: number;
  title: string;
  titleEnglish: string | null;
  titleJapanese: string | null;
  description: string | null;
  cover: string | null;
  fanart: string | null;
  videoUrl: string;
  releaseYear: number | null;
  releaseDate: string | null;
  viewCount: number | null;
  favoriteCount: number | null;
  isActive: number | null;
  categoryId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: readonly Tag[];
}>;

export type AnimeSimilarItem = Readonly<{
  id: number;
  title: string;
  cover: string | null;
  fanart: string | null;
  viewCount: number | null;
  matches?: number | null;
}>;

export type SitemapAnime = Readonly<{
  id: number;
  createdAt: string | null;
  updatedAt: string | null;
}>;

export type SitemapTag = Readonly<{
  id: number;
  name: string;
}>;

export type SitemapData = Readonly<{
  animes: readonly SitemapAnime[];
  tags: readonly SitemapTag[];
}>;

export type AnimeSeed = Readonly<{
  id: number;
  title: string;
  titleEnglish?: string | null;
  titleJapanese?: string | null;
  description?: string | null;
  cover?: string | null;
  fanart?: string | null;
  videoUrl?: string;
  releaseYear?: number | null;
  releaseDate?: string | null;
  viewCount?: number | null;
  favoriteCount?: number | null;
  isActive?: number | null;
  categoryId?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  tagIds?: readonly number[];
}>;
