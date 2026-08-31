import type { RowDataPacket } from 'mysql2';
import { pool, withConsistentRead, withDbRetry } from '@/lib/db';
import { getPageWindow } from '../../shared/pagination';
import type {
  FavoriteAnimePage,
  FavoriteAnimeListItem,
  FavoritePageRequest,
  FavoritesRepository,
} from '../../identity/ports/favorites-repository';

/**
 * Favorites are stored only in the system `favorites` list
 * (`user_lists` + `user_list_items`). The legacy `user_favorites` table is
 * no longer written; a one-way backfill still runs on ensureSystemLists.
 */

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return new Date().toISOString();
  const s = String(value);
  if (s.includes('T')) return s;
  return `${s.replace(' ', 'T')}Z`;
}

function mapFavoriteAnime(row: RowDataPacket): FavoriteAnimeListItem {
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    cover: row.cover == null ? null : String(row.cover),
    viewCount: row.view_count == null ? null : Number(row.view_count),
    titleEnglish: row.title_english == null ? null : String(row.title_english),
    favoritedAt: asIso(row.favorited_at),
  };
}

async function ensureFavoritesListId(userId: number): Promise<number> {
  await pool.query(
    `INSERT INTO user_lists (user_id, name, list_type, visibility, is_system, sort_order)
     SELECT ?, '收藏', 'favorites', 'private', 1, 0
     FROM DUAL
     WHERE NOT EXISTS (
       SELECT 1 FROM user_lists
       WHERE user_id = ? AND list_type = 'favorites' AND is_system = 1
     )`,
    [userId, userId],
  );

  // One-way backfill from legacy table when present (no dual-write back).
  try {
    await pool.query(
      `INSERT INTO user_list_items (list_id, anime_id, sort_order, created_at)
       SELECT l.id, f.anime_id, 0, f.created_at
       FROM user_favorites f
       INNER JOIN user_lists l
         ON l.user_id = f.user_id AND l.list_type = 'favorites' AND l.is_system = 1
       WHERE f.user_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM user_list_items i
           WHERE i.list_id = l.id AND i.anime_id = f.anime_id
         )`,
      [userId],
    );
  } catch {
    /* user_favorites may be empty or absent on fresh installs */
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM user_lists
     WHERE user_id = ? AND list_type = 'favorites' AND is_system = 1
     ORDER BY id ASC
     LIMIT 1`,
    [userId],
  );
  const listId = Number(rows[0]?.id ?? 0);
  if (!listId) {
    throw new Error('Failed to resolve system favorites list');
  }
  return listId;
}

export class MariaDbFavoritesRepository implements FavoritesRepository {
  listAnimeIds(userId: number): Promise<ReadonlyArray<number>> {
    return withDbRetry(async () => {
      const listId = await ensureFavoritesListId(userId);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT anime_id FROM user_list_items
         WHERE list_id = ?
         ORDER BY created_at DESC, id DESC`,
        [listId],
      );
      return rows.map((r) => Number(r.anime_id));
    });
  }

  listWithAnime(userId: number): Promise<ReadonlyArray<FavoriteAnimeListItem>> {
    return withDbRetry(async () => {
      const listId = await ensureFavoritesListId(userId);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT a.id, a.title, a.cover, a.view_count, a.title_english, i.created_at AS favorited_at
         FROM user_list_items i
         INNER JOIN animes a ON a.id = i.anime_id
         WHERE i.list_id = ?
         ORDER BY i.created_at DESC, i.id DESC`,
        [listId],
      );
      return rows.map(mapFavoriteAnime);
    });
  }

  async listWithAnimePage(
    userId: number,
    request: FavoritePageRequest,
  ): Promise<FavoriteAnimePage> {
    const listId = await withDbRetry(() => ensureFavoritesListId(userId));
    return withConsistentRead(async (connection) => {
      const [countRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM user_list_items i
         INNER JOIN animes a ON a.id = i.anime_id
         WHERE i.list_id = ?`,
        [listId],
      );
      const total = Math.max(0, Number(countRows[0]?.total ?? 0));
      const window = getPageWindow(request.page, total, request.pageSize);

      if (total === 0) {
        return {
          items: [],
          page: window.page,
          pageSize: window.pageSize,
          total: window.total,
          totalPages: window.totalPages,
        };
      }

      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT a.id, a.title, a.cover, a.view_count, a.title_english, i.created_at AS favorited_at
         FROM user_list_items i
         INNER JOIN animes a ON a.id = i.anime_id
         WHERE i.list_id = ?
         ORDER BY i.created_at DESC, i.id DESC
         LIMIT ? OFFSET ?`,
        [listId, window.pageSize, window.offset],
      );

      return {
        items: rows.map(mapFavoriteAnime),
        page: window.page,
        pageSize: window.pageSize,
        total: window.total,
        totalPages: window.totalPages,
      };
    });
  }

  isFavorite(userId: number, animeId: number): Promise<boolean> {
    return withDbRetry(async () => {
      const listId = await ensureFavoritesListId(userId);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id FROM user_list_items
         WHERE list_id = ? AND anime_id = ?
         LIMIT 1`,
        [listId, animeId],
      );
      return rows.length > 0;
    });
  }

  add(userId: number, animeId: number): Promise<void> {
    return withDbRetry(async () => {
      const listId = await ensureFavoritesListId(userId);
      await pool.query(
        `INSERT INTO user_list_items (list_id, anime_id, sort_order)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE anime_id = VALUES(anime_id)`,
        [listId, animeId],
      );
    });
  }

  remove(userId: number, animeId: number): Promise<void> {
    return withDbRetry(async () => {
      const listId = await ensureFavoritesListId(userId);
      await pool.query(
        'DELETE FROM user_list_items WHERE list_id = ? AND anime_id = ?',
        [listId, animeId],
      );
    });
  }
}
