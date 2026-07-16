import { pool, withDbRetry } from '@/lib/db';
import type {
  UserEventInput,
  UserEventsRepository,
} from '../../identity/ports/user-events-repository';

export class MariaDbUserEventsRepository implements UserEventsRepository {
  async insert(event: UserEventInput): Promise<void> {
    return withDbRetry(async () => {
      await pool.query(
        `INSERT INTO user_events (
          user_id, anonymous_id, event_type, anime_id, episode_id, session_id, properties_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          event.userId ?? null,
          event.anonymousId ?? null,
          event.eventType,
          event.animeId ?? null,
          event.episodeId ?? null,
          event.sessionId ?? null,
          event.properties ? JSON.stringify(event.properties) : null,
        ],
      );
    });
  }
}
