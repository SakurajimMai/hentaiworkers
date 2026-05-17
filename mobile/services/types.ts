// 与生产环境 Cloudflare Functions API 保持一致的响应类型。

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
