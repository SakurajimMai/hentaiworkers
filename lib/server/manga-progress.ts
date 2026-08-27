import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool, withDbRetry } from '@/lib/db';
import { getIdentityService } from '@/lib/server/identity';
import { AppError } from '@/lib/server/shared/errors';

export type MangaProgressItem = Readonly<{
  mangaId: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  chapterNumber: number;
  pageIndex: number;
  lastReadAt: string;
}>;

const MAX_LIST = 100;

let schemaReady: Promise<void> | null = null;

export async function ensureMangaProgressSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = withDbRetry(async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS manga_reading_progress (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          manga_id INT NOT NULL,
          chapter_number INT NOT NULL DEFAULT 1,
          page_index INT NOT NULL DEFAULT 0,
          last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY manga_reading_progress_user_manga_uidx (user_id, manga_id),
          KEY manga_reading_progress_user_last_idx (user_id, last_read_at),
          KEY manga_reading_progress_manga_id_idx (manga_id)
        )
      `);
    }).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function assertMangaId(mangaId: number): void {
  if (!Number.isInteger(mangaId) || mangaId <= 0) {
    throw new AppError('RESULT_INVALID', '无效的漫画 ID', 400);
  }
}

export function normalizeMangaProgressInput(input: {
  chapterNumber?: unknown;
  pageIndex?: unknown;
} = {}): { chapterNumber: number; pageIndex: number } {
  const chapterNumber = Math.floor(Number(input.chapterNumber));
  const pageIndex = Math.floor(Number(input.pageIndex ?? 0));
  if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
    throw new AppError('RESULT_INVALID', '无效的章节', 400);
  }
  return {
    chapterNumber,
    pageIndex: Number.isFinite(pageIndex) ? Math.max(0, pageIndex) : 0,
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value ?? '');
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export async function listMangaProgress(limit = 24): Promise<ReadonlyArray<MangaProgressItem>> {
  const user = await getIdentityService().requireUser();
  await ensureMangaProgressSchema();
  const capped = Math.min(Math.max(1, limit), MAX_LIST);

  return withDbRetry(async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.manga_id, p.chapter_number, p.page_index, p.last_read_at,
              m.slug, m.title, m.cover_url
       FROM manga_reading_progress p
       INNER JOIN mangas m ON m.id = p.manga_id
       WHERE p.user_id = ? AND m.is_published = 1
       ORDER BY p.last_read_at DESC
       LIMIT ?`,
      [user.id, capped],
    );
    return rows.map((row) => ({
      mangaId: Number(row.manga_id),
      slug: String(row.slug),
      title: String(row.title),
      coverUrl: row.cover_url == null ? null : String(row.cover_url),
      chapterNumber: Number(row.chapter_number),
      pageIndex: Number(row.page_index ?? 0),
      lastReadAt: toIso(row.last_read_at),
    }));
  });
}

export async function upsertMangaProgress(
  mangaId: number,
  input: { chapterNumber?: unknown; pageIndex?: unknown },
): Promise<{ mangaId: number; chapterNumber: number; pageIndex: number }> {
  assertMangaId(mangaId);
  const user = await getIdentityService().requireUser();
  const next = normalizeMangaProgressInput(input);
  await ensureMangaProgressSchema();

  await withDbRetry(async () => {
    await pool.query<ResultSetHeader>(
      `INSERT INTO manga_reading_progress (user_id, manga_id, chapter_number, page_index, last_read_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         chapter_number = VALUES(chapter_number),
         page_index = VALUES(page_index),
         last_read_at = CURRENT_TIMESTAMP`,
      [user.id, mangaId, next.chapterNumber, next.pageIndex],
    );
  });

  return { mangaId, ...next };
}

export async function deleteMangaProgress(mangaId: number): Promise<void> {
  assertMangaId(mangaId);
  const user = await getIdentityService().requireUser();
  await ensureMangaProgressSchema();
  await withDbRetry(async () => {
    await pool.query('DELETE FROM manga_reading_progress WHERE user_id = ? AND manga_id = ?', [
      user.id,
      mangaId,
    ]);
  });
}

export async function deleteAllMangaProgress(): Promise<void> {
  const user = await getIdentityService().requireUser();
  await ensureMangaProgressSchema();
  await withDbRetry(async () => {
    await pool.query('DELETE FROM manga_reading_progress WHERE user_id = ?', [user.id]);
  });
}

export async function mergeGuestMangaProgress(
  rows: ReadonlyArray<{
    mangaId: number;
    chapterNumber: number;
    pageIndex?: number;
    lastReadAt?: string;
  }>,
): Promise<{ merged: number }> {
  const user = await getIdentityService().requireUser();
  await ensureMangaProgressSchema();
  let merged = 0;

  for (const row of rows.slice(0, MAX_LIST)) {
    if (!Number.isInteger(row.mangaId) || row.mangaId <= 0) continue;
    const chapterNumber = Math.floor(Number(row.chapterNumber));
    if (!Number.isFinite(chapterNumber) || chapterNumber < 1) continue;
    const pageIndex = Math.max(0, Math.floor(Number(row.pageIndex ?? 0)) || 0);
    const incomingAt = row.lastReadAt ? new Date(row.lastReadAt).getTime() : Date.now();
    const lastReadAt = Number.isFinite(incomingAt) ? new Date(incomingAt) : new Date();

    await withDbRetry(async () => {
      const [existing] = await pool.query<RowDataPacket[]>(
        `SELECT chapter_number, last_read_at FROM manga_reading_progress
         WHERE user_id = ? AND manga_id = ? LIMIT 1`,
        [user.id, row.mangaId],
      );
      const current = existing[0];
      if (current) {
        const currentAt = new Date(current.last_read_at).getTime();
        if (Number.isFinite(currentAt) && currentAt >= lastReadAt.getTime()) return;
      }
      await pool.query(
        `INSERT INTO manga_reading_progress (user_id, manga_id, chapter_number, page_index, last_read_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           chapter_number = VALUES(chapter_number),
           page_index = VALUES(page_index),
           last_read_at = VALUES(last_read_at)`,
        [user.id, row.mangaId, chapterNumber, pageIndex, lastReadAt],
      );
      merged += 1;
    });
  }

  return { merged };
}
