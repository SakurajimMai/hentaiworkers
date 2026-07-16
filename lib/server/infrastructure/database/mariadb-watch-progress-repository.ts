import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, withDbRetry } from '@/lib/db';
import type {
  UpsertWatchProgressInput,
  WatchProgressAnimeItem,
  WatchProgressRecord,
  WatchProgressRepository,
} from '../../identity/ports/watch-progress-repository';

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return new Date().toISOString();
  const s = String(value);
  if (s.includes('T')) return s;
  return `${s.replace(' ', 'T')}Z`;
}

function mapRow(row: RowDataPacket): WatchProgressRecord {
  return {
    userId: Number(row.user_id),
    animeId: Number(row.anime_id),
    episodeId: row.episode_id == null ? null : Number(row.episode_id),
    positionSeconds: Number(row.position_seconds ?? 0),
    durationSeconds: Number(row.duration_seconds ?? 0),
    completed: Number(row.completed) === 1,
    firstWatchedAt: asIso(row.first_watched_at),
    lastWatchedAt: asIso(row.last_watched_at),
    updatedAt: asIso(row.updated_at),
  };
}

function toSqlDate(value: Date): string {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

function resolveProgressUpdate(
  existing: WatchProgressRecord | null,
  input: UpsertWatchProgressInput,
): { position: number; duration: number; completed: boolean } {
  if (!existing) {
    const duration = Math.max(0, input.durationSeconds);
    const completed = input.completed;
    const position =
      completed && duration > 0
        ? Math.max(input.positionSeconds, duration)
        : input.positionSeconds;
    return { position, duration, completed };
  }

  const duration = Math.max(existing.durationSeconds, input.durationSeconds);
  const rewatchRestart =
    !input.force
    && existing.completed
    && !input.completed
    && input.positionSeconds < Math.max(30, Math.floor(duration * 0.1));

  if (input.force) {
    const completed = input.completed;
    const position =
      completed && duration > 0
        ? Math.max(input.positionSeconds, duration)
        : input.positionSeconds;
    return { position, duration, completed };
  }

  if (rewatchRestart) {
    return {
      position: input.positionSeconds,
      duration,
      completed: false,
    };
  }

  let position = input.positionSeconds;
  let completed = input.completed || existing.completed;
  if (!input.completed && position < existing.positionSeconds && !existing.completed) {
    position = existing.positionSeconds;
  }
  if (completed && duration > 0) {
    position = Math.max(position, duration);
  }
  return { position, duration, completed };
}

export class MariaDbWatchProgressRepository implements WatchProgressRepository {
  async listForUser(userId: number, limit = 24): Promise<ReadonlyArray<WatchProgressAnimeItem>> {
    return withDbRetry(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT p.*, a.title, a.cover, a.video_url, a.is_active
         FROM user_watch_progress p
         INNER JOIN animes a ON a.id = p.anime_id
         WHERE p.user_id = ?
         ORDER BY p.last_watched_at DESC
         LIMIT ?`,
        [userId, limit],
      );
      return rows.map((row) => ({
        ...mapRow(row),
        title: String(row.title ?? ''),
        cover: row.cover == null ? null : String(row.cover),
        videoUrl: String(row.video_url ?? ''),
        isActive: Number(row.is_active ?? 1) === 1,
      }));
    });
  }

  async get(userId: number, animeId: number): Promise<WatchProgressRecord | null> {
    return withDbRetry(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM user_watch_progress WHERE user_id = ? AND anime_id = ? LIMIT 1`,
        [userId, animeId],
      );
      const row = rows[0];
      return row ? mapRow(row) : null;
    });
  }

  async upsert(input: UpsertWatchProgressInput): Promise<WatchProgressRecord> {
    return withDbRetry(async () => {
      const conn = (await pool.getConnection()) as PoolConnection;
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM user_watch_progress
           WHERE user_id = ? AND anime_id = ?
           LIMIT 1
           FOR UPDATE`,
          [input.userId, input.animeId],
        );
        const existing = rows[0] ? mapRow(rows[0]) : null;
        const lastSql = toSqlDate(input.lastWatchedAt ?? new Date());
        const next = resolveProgressUpdate(existing, input);

        if (!existing) {
          await conn.query(
            `INSERT INTO user_watch_progress (
              user_id, anime_id, position_seconds, duration_seconds, completed,
              first_watched_at, last_watched_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              position_seconds = VALUES(position_seconds),
              duration_seconds = GREATEST(duration_seconds, VALUES(duration_seconds)),
              completed = VALUES(completed),
              last_watched_at = VALUES(last_watched_at),
              updated_at = UTC_TIMESTAMP()`,
            [
              input.userId,
              input.animeId,
              next.position,
              next.duration,
              next.completed ? 1 : 0,
              lastSql,
              lastSql,
            ],
          );
        } else {
          await conn.query(
            `UPDATE user_watch_progress SET
              position_seconds = ?,
              duration_seconds = ?,
              completed = ?,
              last_watched_at = ?,
              updated_at = UTC_TIMESTAMP()
             WHERE user_id = ? AND anime_id = ?`,
            [
              next.position,
              next.duration,
              next.completed ? 1 : 0,
              lastSql,
              input.userId,
              input.animeId,
            ],
          );
        }

        await conn.commit();
        const [finalRows] = await conn.query<RowDataPacket[]>(
          `SELECT * FROM user_watch_progress WHERE user_id = ? AND anime_id = ? LIMIT 1`,
          [input.userId, input.animeId],
        );
        return mapRow(finalRows[0]!);
      } catch (error) {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        throw error;
      } finally {
        conn.release();
      }
    });
  }

  async delete(userId: number, animeId: number): Promise<void> {
    return withDbRetry(async () => {
      await pool.query(
        'DELETE FROM user_watch_progress WHERE user_id = ? AND anime_id = ?',
        [userId, animeId],
      );
    });
  }

  async deleteAll(userId: number): Promise<void> {
    return withDbRetry(async () => {
      await pool.query('DELETE FROM user_watch_progress WHERE user_id = ?', [userId]);
    });
  }
}

export type { ResultSetHeader };
