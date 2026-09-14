import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import type { ResultSetHeader } from 'mysql2';
import { pool, withDbRetry } from '@/lib/db';
import { getIdentityService } from '@/lib/server/identity';

/**
 * Real 里番 view tracking.
 *
 * Mirrors lib/manga-views.ts: one view per viewer per anime per UTC day.
 * `anime_view_days` keeps the history used by future ranking, and the same
 * deduped event bumps `animes.view_count`, which stays the cheap counter read
 * by list responses and by `sort=popular`.
 *
 * `animes.favorite_count` is NOT touched here; real favourites are counted from
 * `user_lists` / `user_list_items` (see the catalog read repository).
 */

export const ANIME_VIEW_DAYS_DDL = `
  CREATE TABLE IF NOT EXISTS anime_view_days (
    anime_id INT NOT NULL,
    day DATE NOT NULL,
    view_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (anime_id, day),
    INDEX anime_view_days_day_idx (day)
  )
`;

export const ANIME_VIEW_DEDUP_DDL = `
  CREATE TABLE IF NOT EXISTS anime_view_dedup (
    anime_id INT NOT NULL,
    viewer_key VARCHAR(80) NOT NULL,
    day DATE NOT NULL,
    PRIMARY KEY (anime_id, viewer_key, day)
  )
`;

export const ANIME_VIEW_DEDUP_INSERT_SQL =
  'INSERT IGNORE INTO anime_view_dedup (anime_id, viewer_key, day) VALUES (?, ?, ?)';

/**
 * Only existing, visible works are counted. The statement has to run anyway, so
 * its affected-row count doubles as the cheap "does this id exist" guard.
 */
export const ANIME_VIEW_TOTAL_SQL = `
  UPDATE animes
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = ? AND (is_active = 1 OR is_active IS NULL)
`;

export const ANIME_VIEW_DAY_SQL = `
  INSERT INTO anime_view_days (anime_id, day, view_count) VALUES (?, ?, 1)
  ON DUPLICATE KEY UPDATE view_count = view_count + 1
`;

/** Minimal database port so the recorder can be unit tested without a pool. */
export type AnimeViewDatabase = Readonly<{
  /** Runs one statement and reports affected rows (0 when INSERT IGNORE dedupes). */
  run(sql: string, params?: readonly unknown[]): Promise<number>;
  withRetry<T>(operation: () => Promise<T>): Promise<T>;
}>;

export type AnimeViewRecorderDependencies = Readonly<{
  database: AnimeViewDatabase;
  resolveViewerKey: () => Promise<string>;
  today?: () => string;
}>;

export type AnimeViewRecorder = (animeId: number) => Promise<void>;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function hashViewer(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

async function viewerKey(): Promise<string> {
  const user = await getIdentityService().getCurrentUser();
  if (user) return `u:${user.id}`;
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'anon';
  return `a:${hashViewer(ip)}`;
}

export function createAnimeViewRecorder(
  dependencies: AnimeViewRecorderDependencies,
): AnimeViewRecorder {
  const { database, resolveViewerKey } = dependencies;
  const today = dependencies.today ?? todayUtc;
  let schemaReady: Promise<void> | null = null;

  async function ensureAnimeViewSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = database
        .withRetry(async () => {
          await database.run(ANIME_VIEW_DAYS_DDL);
          await database.run(ANIME_VIEW_DEDUP_DDL);
        })
        .catch((error) => {
          schemaReady = null;
          throw error;
        });
    }
    await schemaReady;
  }

  /** Count one play per viewer per anime per UTC day. Never throws into the caller. */
  return async function recordAnimeView(animeId: number): Promise<void> {
    if (!Number.isInteger(animeId) || animeId <= 0) return;
    try {
      await ensureAnimeViewSchema();
      const key = await resolveViewerKey();
      const day = today();
      await database.withRetry(async () => {
        const deduped = await database.run(ANIME_VIEW_DEDUP_INSERT_SQL, [animeId, key, day]);
        if (!deduped) return;
        const counted = await database.run(ANIME_VIEW_TOTAL_SQL, [animeId]);
        if (!counted) return;
        await database.run(ANIME_VIEW_DAY_SQL, [animeId, day]);
      });
    } catch (error) {
      console.error('recordAnimeView failed', error);
    }
  };
}

const poolDatabase: AnimeViewDatabase = {
  async run(sql, params) {
    const [result] = await pool.query<ResultSetHeader>(
      sql,
      params ? [...params] : undefined,
    );
    return result?.affectedRows ?? 0;
  },
  withRetry: (operation) => withDbRetry(operation),
};

export const recordAnimeView: AnimeViewRecorder = createAnimeViewRecorder({
  database: poolDatabase,
  resolveViewerKey: viewerKey,
});
