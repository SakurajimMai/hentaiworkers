import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import type { ResultSetHeader } from 'mysql2';
import { pool, withDbRetry } from '@/lib/db';
import { getIdentityService } from '@/lib/server/identity';

export type MangaRank = 'day' | 'week' | 'month' | 'all';

let schemaReady: Promise<void> | null = null;

export function isMangaRank(value: string | undefined): value is MangaRank {
  return value === 'day' || value === 'week' || value === 'month' || value === 'all';
}

export function mangaRankSince(rank: MangaRank): string | null {
  if (rank === 'all') return null;
  const now = new Date();
  const days = rank === 'day' ? 0 : rank === 'week' ? 6 : 29;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
  return start.toISOString().slice(0, 10);
}

async function ensureMangaViewSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = withDbRetry(async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS manga_view_days (
          manga_id INT NOT NULL,
          day DATE NOT NULL,
          view_count INT NOT NULL DEFAULT 0,
          PRIMARY KEY (manga_id, day),
          INDEX manga_view_days_day_idx (day)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS manga_view_dedup (
          manga_id INT NOT NULL,
          viewer_key VARCHAR(80) NOT NULL,
          day DATE NOT NULL,
          PRIMARY KEY (manga_id, viewer_key, day)
        )
      `);
    }).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

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

/** Count one read per viewer per manga per UTC day. */
export async function recordMangaView(mangaId: number): Promise<void> {
  if (!Number.isInteger(mangaId) || mangaId <= 0) return;
  try {
    await ensureMangaViewSchema();
    const key = await viewerKey();
    const day = todayUtc();
    await withDbRetry(async () => {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT IGNORE INTO manga_view_dedup (manga_id, viewer_key, day) VALUES (?, ?, ?)`,
        [mangaId, key, day],
      );
      if (!result.affectedRows) return;
      await pool.query(
        `INSERT INTO manga_view_days (manga_id, day, view_count) VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE view_count = view_count + 1`,
        [mangaId, day],
      );
    });
  } catch (error) {
    console.error('recordMangaView failed', error);
  }
}

export async function ensureMangaViewsReady(): Promise<void> {
  try {
    await ensureMangaViewSchema();
  } catch (error) {
    console.error('ensureMangaViewSchema failed', error);
  }
}
