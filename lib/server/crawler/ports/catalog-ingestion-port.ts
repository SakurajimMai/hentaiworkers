export type CatalogIngestionInput = Readonly<{
  source: string;
  sourceId: string;
  title: string;
  videoUrl: string;
  titleEnglish?: string | null;
  titleJapanese?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  fanartUrls?: readonly string[];
  tags?: readonly string[];
  releaseYear?: number | null;
  releaseDate?: string | null;
  remarks?: string | null;
  /** 主演 vod_actor */
  actors?: string | null;
  /** 导演 vod_director */
  directors?: string | null;
  /** 别名 vod_sub 等 */
  aliases?: string | null;
  /** 地区 vod_area */
  area?: string | null;
  /** 语言 vod_lang */
  lang?: string | null;
  /** 源站更新时间 vod_time 原文 */
  sourceUpdatedAt?: string | null;
  /** Full play lines [{name,flag,episodes:[{name,url}]}] for works UI. */
  playLines?: ReadonlyArray<{
    name: string;
    flag?: string;
    episodes: ReadonlyArray<{ name: string; url: string }>;
  }>;
}>;

export type CatalogIngestionResult = Readonly<{
  /**
   * Catalog entity id written by this commit.
   * - legacy_animes → `animes.id`
   * - anime_works → `anime_works.id`
   * Stored on `crawler_job_items.anime_id` as an opaque catalog ref (no FK).
   */
  animeId: number;
  created: boolean;
  /** Which catalog table family received the row. */
  target: 'legacy_animes' | 'anime_works';
  /** Present when target is anime_works (same as animeId). */
  workId?: number;
}>;

/** Catalog write boundary used inside the crawler transaction. */
export interface CatalogIngestionPort {
  upsertFromCrawler(input: CatalogIngestionInput): Promise<CatalogIngestionResult>;
  /** Existing source mapping used by legacy skip_existing before large media transfer. */
  findExistingBySource?(
    source: string,
    sourceId: string,
  ): Promise<CatalogIngestionResult | null>;
}
