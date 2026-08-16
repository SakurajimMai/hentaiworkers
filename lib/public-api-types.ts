export type SortType = 'latest' | 'popular';

export type ListAnimesOptions = {
  page: number;
  limit: number;
  tagId?: number;
  search?: string;
  sort: SortType;
};

export type AnimeListItem = {
  id: number;
  title: string;
  cover: string | null;
  viewCount: number | null;
  titleEnglish: string | null;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AnimeListResponse = {
  data: readonly AnimeListItem[];
  pagination: Pagination;
};

export type Tag = {
  id: number;
  name: string;
  description: string | null;
};

export type TagSummary = {
  id: number;
  name: string;
};

export type AnimeDetail = {
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
};

export type AnimeSimilarItem = {
  id: number;
  title: string;
  cover: string | null;
  fanart: string | null;
  viewCount: number | null;
  matches?: number | null;
};

export type HealthResultRow = {
  ok: number;
};

export type HealthOk = {
  ok: boolean;
  database: string;
  result: HealthResultRow[];
  version: string;
};

export type HealthError = {
  ok: boolean;
  error: string;
};

export type ErrorResponse = {
  error: string;
};

export type PublicFeedAdSlot = {
  enabled: boolean;
  name: string;
  interval: number;
  href: string;
  html: string;
};

export type PublicReaderAdSlot = {
  enabled: boolean;
  html: string;
  interval: number;
};

export type PublicPlayerPreRollAd = {
  enabled: boolean;
  videoUrl: string;
  imageUrl: string;
  html: string;
  clickUrl: string;
  playDuration: number;
  totalDuration: number;
  muted: boolean;
};

export type PublicPlayerPauseAd = {
  enabled: boolean;
  videoUrl: string;
  imageUrl: string;
  html: string;
  clickUrl: string;
  muted: boolean;
};

export type PublicAdsConfig = {
  feedSlots: PublicFeedAdSlot[];
  reader: {
    top: PublicReaderAdSlot;
    middle: PublicReaderAdSlot;
    bottom: PublicReaderAdSlot;
  };
  player: {
    preRollAd: PublicPlayerPreRollAd;
    pauseAd: PublicPlayerPauseAd;
  };
};

export interface PublicAnimeService {
  listAnimes(options: ListAnimesOptions): Promise<AnimeListResponse>;
  getAnimeById(id: number): Promise<AnimeDetail | null>;
  getSimilarAnimes(id: number): Promise<readonly AnimeSimilarItem[]>;
  listTags(): Promise<readonly TagSummary[]>;
}
