// 与生产环境 Next.js 公开 API 保持一致的响应类型。

export interface Tag {
  id: number;
  name: string;
  description?: string | null;
}

export interface Anime {
  id: number;
  title: string;
  titleEnglish?: string | null;
  titleJapanese?: string | null;
  description?: string | null;
  cover?: string | null;
  fanart?: string | null;
  videoUrl?: string | null;
  releaseYear?: number | null;
  releaseDate?: string | null;
  viewCount?: number | null;
  favoriteCount?: number | null;
  isActive?: number | null;
  categoryId?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  tags?: Tag[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AnimeListResponse {
  data: Anime[];
  pagination: Pagination;
}

export interface AnimeListParams {
  page?: number;
  limit?: number;
  tagId?: number;
  search?: string;
  sort?: 'latest' | 'popular';
}

export type MangaRank = 'day' | 'week' | 'month' | 'all';

export interface MangaSummary {
  id: number;
  slug: string;
  title: string;
  author?: string | null;
  tags: string[];
  description?: string | null;
  coverUrl?: string | null;
  chapterCount: number;
  pageCount: number;
  updatedAt?: string | null;
}

export interface MangaChapterSummary {
  id: number;
  number: number;
  title?: string | null;
  pageCount: number;
}

export interface MangaDetail extends MangaSummary {
  chapters: MangaChapterSummary[];
}

export interface MangaPage {
  index: number;
  imageUrl: string;
}

export interface MangaChapterDetail extends MangaChapterSummary {
  pages: MangaPage[];
}

export interface MangaListResponse {
  data: MangaSummary[];
  pagination: Pagination;
}

export interface MangaListParams {
  page?: number;
  limit?: number;
  q?: string;
  tag?: string;
  rank?: MangaRank;
}

export interface MangaChapterResponse {
  manga: {
    id: number;
    title: string;
    coverUrl?: string | null;
  };
  chapter: MangaChapterDetail;
}
