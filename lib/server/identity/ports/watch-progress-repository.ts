export type WatchProgressRecord = Readonly<{
  userId: number;
  animeId: number;
  episodeId: number | null;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  firstWatchedAt: string;
  lastWatchedAt: string;
  updatedAt: string;
}>;

export type WatchProgressAnimeItem = WatchProgressRecord &
  Readonly<{
    title: string;
    cover: string | null;
    videoUrl: string;
    isActive: boolean;
  }>;

export type UpsertWatchProgressInput = Readonly<{
  userId: number;
  animeId: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  lastWatchedAt?: Date;
  /** When true, allow decreasing position (merge / explicit reset). */
  force?: boolean;
}>;

export interface WatchProgressRepository {
  listForUser(userId: number, limit?: number): Promise<ReadonlyArray<WatchProgressAnimeItem>>;
  get(userId: number, animeId: number): Promise<WatchProgressRecord | null>;
  upsert(input: UpsertWatchProgressInput): Promise<WatchProgressRecord>;
  delete(userId: number, animeId: number): Promise<void>;
  deleteAll(userId: number): Promise<void>;
}
