export type WorkEpisode = Readonly<{
  name: string;
  url: string;
}>;

export type WorkPlayLine = Readonly<{
  name: string;
  flag: string;
  episodes: ReadonlyArray<WorkEpisode>;
}>;

export type AnimeWorkSummary = Readonly<{
  id: number;
  title: string;
  titleEnglish: string | null;
  titleJapanese: string | null;
  coverUrl: string | null;
  streamUrl: string;
  streamFormat: string;
  releaseYear: number | null;
  remarks: string | null;
  actors: string | null;
  directors: string | null;
  aliases: string | null;
  area: string | null;
  lang: string | null;
  sourceUpdatedAt: string | null;
  isActive: boolean;
  viewCount: number;
  updatedAt: string;
  sources: ReadonlyArray<{ source: string; sourceId: string }>;
  /** Number of play lines stored in play_lines_json. */
  playLineCount: number;
  /** Total episodes across all play lines. */
  episodeCount: number;
}>;

export type AnimeWorkDetail = AnimeWorkSummary &
  Readonly<{
    description: string | null;
    fanartUrls: ReadonlyArray<string>;
    releaseDate: string | null;
    createdAt: string;
    tags: ReadonlyArray<{ id: number; name: string }>;
    playLines: ReadonlyArray<WorkPlayLine>;
  }>;

export type AnimeWorkListQuery = Readonly<{
  page?: number;
  limit?: number;
  search?: string;
  source?: string;
  activeOnly?: boolean;
}>;

export type AnimeWorkPage = Readonly<{
  data: ReadonlyArray<AnimeWorkSummary>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}>;

/** Admin-editable fields for external anime_works (not source provenance). */
export type AnimeWorkUpdateInput = Readonly<{
  title: string;
  titleEnglish: string | null;
  titleJapanese: string | null;
  description: string | null;
  coverUrl: string | null;
  fanartUrls: ReadonlyArray<string>;
  streamUrl: string;
  streamFormat: string;
  releaseYear: number | null;
  releaseDate: string | null;
  remarks: string | null;
  actors: string | null;
  directors: string | null;
  aliases: string | null;
  area: string | null;
  lang: string | null;
  sourceUpdatedAt: string | null;
  isActive: boolean;
  tagIds: ReadonlyArray<number>;
  playLines: ReadonlyArray<WorkPlayLine>;
}>;
