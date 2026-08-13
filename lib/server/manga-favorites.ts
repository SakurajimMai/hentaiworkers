import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool, withDbRetry } from '@/lib/db';
import { getIdentityService } from '@/lib/server/identity';
import { AppError } from '@/lib/server/shared/errors';

export type MangaFavoriteItem = Readonly<{
  mangaId: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  pageCount: number;
  favoritedAt: string;
}>;

function assertMangaId(mangaId: number): void {
  if (!Number.isInteger(mangaId) || mangaId <= 0) {
    throw new AppError('RESULT_INVALID', '无效的漫画 ID', 400);
  }
}

async function requireMangaUser() {
  return getIdentityService().requireUser();
}

export async function isMangaFavorite(mangaId: number): Promise<boolean> {
  assertMangaId(mangaId);
  const user = await getIdentityService().getCurrentUser();
  if (!user) return false;

  return withDbRetry(async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM manga_favorites WHERE user_id = ? AND manga_id = ? LIMIT 1`,
      [user.id, mangaId],
    );
    return rows.length > 0;
  });
}

export async function toggleMangaFavorite(mangaId: number): Promise<{ favorited: boolean }> {
  assertMangaId(mangaId);
  const user = await requireMangaUser();

  return withDbRetry(async () => {
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM manga_favorites WHERE user_id = ? AND manga_id = ? LIMIT 1`,
      [user.id, mangaId],
    );
    if (existing.length > 0) {
      await pool.query('DELETE FROM manga_favorites WHERE user_id = ? AND manga_id = ?', [user.id, mangaId]);
      return { favorited: false };
    }

    await pool.query<ResultSetHeader>(
      `INSERT INTO manga_favorites (user_id, manga_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE manga_id = VALUES(manga_id)`,
      [user.id, mangaId],
    );
    return { favorited: true };
  });
}

export async function listMangaFavorites(): Promise<ReadonlyArray<MangaFavoriteItem>> {
  const user = await requireMangaUser();

  return withDbRetry(async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT f.manga_id, f.created_at, m.slug, m.title, m.cover_url, m.page_count
       FROM manga_favorites f
       INNER JOIN mangas m ON m.id = f.manga_id
       WHERE f.user_id = ? AND m.is_published = 1
       ORDER BY f.created_at DESC`,
      [user.id],
    );
    return rows.map((row) => ({
      mangaId: Number(row.manga_id),
      slug: String(row.slug),
      title: String(row.title),
      coverUrl: row.cover_url == null ? null : String(row.cover_url),
      pageCount: Number(row.page_count ?? 0),
      favoritedAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ''),
    }));
  });
}
