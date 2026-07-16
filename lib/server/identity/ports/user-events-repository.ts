export type UserEventInput = Readonly<{
  userId?: number | null;
  anonymousId?: string | null;
  eventType: string;
  animeId?: number | null;
  episodeId?: number | null;
  sessionId?: string | null;
  properties?: Record<string, unknown> | null;
}>;

export interface UserEventsRepository {
  insert(event: UserEventInput): Promise<void>;
}
