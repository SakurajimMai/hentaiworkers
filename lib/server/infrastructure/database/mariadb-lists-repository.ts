import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool, withDbRetry } from '@/lib/db';
import type {
  ListsRepository,
  UserListItemAnime,
  UserListRecord,
  UserListType,
} from '../../identity/ports/lists-repository';

const SYSTEM_LISTS: ReadonlyArray<{ listType: UserListType; name: string; sortOrder: number }> = [
  { listType: 'favorites', name: '收藏', sortOrder: 0 },
  { listType: 'want', name: '想看', sortOrder: 1 },
  { listType: 'watching', name: '在看', sortOrder: 2 },
  { listType: 'completed', name: '已看完', sortOrder: 3 },
];

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return new Date().toISOString();
  const s = String(value);
  if (s.includes('T')) return s;
  return `${s.replace(' ', 'T')}Z`;
}

function mapList(row: RowDataPacket): UserListRecord {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    name: String(row.name),
    listType: row.list_type as UserListType,
    visibility: row.visibility === 'public' ? 'public' : 'private',
    isSystem: Number(row.is_system) === 1,
    sortOrder: Number(row.sort_order ?? 0),
    itemCount: row.item_count == null ? undefined : Number(row.item_count),
  };
}

export class MariaDbListsRepository implements ListsRepository {
  async ensureSystemLists(userId: number): Promise<void> {
    return withDbRetry(async () => {
      for (const def of SYSTEM_LISTS) {
        await pool.query(
          `INSERT INTO user_lists (user_id, name, list_type, visibility, is_system, sort_order)
           SELECT ?, ?, ?, 'private', 1, ?
           FROM DUAL
           WHERE NOT EXISTS (
             SELECT 1 FROM user_lists
             WHERE user_id = ? AND list_type = ? AND is_system = 1
           )`,
          [userId, def.name, def.listType, def.sortOrder, userId, def.listType],
        );
      }

      // Mirror legacy favorites into system favorites list.
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
    });
  }

  async listForUser(userId: number): Promise<ReadonlyArray<UserListRecord>> {
    return withDbRetry(async () => {
      await this.ensureSystemLists(userId);
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT l.*,
           (SELECT COUNT(*) FROM user_list_items i WHERE i.list_id = l.id) AS item_count
         FROM user_lists l
         WHERE l.user_id = ?
         ORDER BY l.is_system DESC, l.sort_order ASC, l.id ASC`,
        [userId],
      );
      return rows.map(mapList);
    });
  }

  async getList(userId: number, listId: number): Promise<UserListRecord | null> {
    return withDbRetry(async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT l.*,
           (SELECT COUNT(*) FROM user_list_items i WHERE i.list_id = l.id) AS item_count
         FROM user_lists l
         WHERE l.user_id = ? AND l.id = ?
         LIMIT 1`,
        [userId, listId],
      );
      return rows[0] ? mapList(rows[0]) : null;
    });
  }

  async createCustomList(userId: number, name: string): Promise<UserListRecord> {
    return withDbRetry(async () => {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO user_lists (user_id, name, list_type, visibility, is_system, sort_order)
         VALUES (?, ?, 'custom', 'private', 0, 100)`,
        [userId, name],
      );
      const list = await this.getList(userId, Number(result.insertId));
      if (!list) throw new Error('Failed to create list');
      return list;
    });
  }

  async deleteCustomList(userId: number, listId: number): Promise<void> {
    return withDbRetry(async () => {
      const list = await this.getList(userId, listId);
      if (!list || list.isSystem || list.listType !== 'custom') return;
      await pool.query('DELETE FROM user_list_items WHERE list_id = ?', [listId]);
      await pool.query('DELETE FROM user_lists WHERE id = ? AND user_id = ?', [listId, userId]);
    });
  }

  async listItems(userId: number, listId: number): Promise<ReadonlyArray<UserListItemAnime>> {
    return withDbRetry(async () => {
      const list = await this.getList(userId, listId);
      if (!list) return [];
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT i.list_id, i.anime_id, i.note, i.sort_order, i.created_at,
                a.title, a.cover, a.view_count
         FROM user_list_items i
         INNER JOIN animes a ON a.id = i.anime_id
         WHERE i.list_id = ?
         ORDER BY i.sort_order ASC, i.created_at DESC`,
        [listId],
      );
      return rows.map((row) => ({
        listId: Number(row.list_id),
        animeId: Number(row.anime_id),
        note: row.note == null ? null : String(row.note),
        sortOrder: Number(row.sort_order ?? 0),
        createdAt: asIso(row.created_at),
        title: String(row.title ?? ''),
        cover: row.cover == null ? null : String(row.cover),
        viewCount: row.view_count == null ? null : Number(row.view_count),
      }));
    });
  }

  async addItem(
    userId: number,
    listId: number,
    animeId: number,
    note: string | null = null,
  ): Promise<void> {
    return withDbRetry(async () => {
      const list = await this.getList(userId, listId);
      if (!list) {
        throw new Error('LIST_NOT_FOUND');
      }
      await pool.query(
        `INSERT INTO user_list_items (list_id, anime_id, note, sort_order)
         VALUES (?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE note = COALESCE(VALUES(note), note)`,
        [listId, animeId, note],
      );
    });
  }

  async removeItem(userId: number, listId: number, animeId: number): Promise<void> {
    return withDbRetry(async () => {
      const list = await this.getList(userId, listId);
      if (!list) {
        throw new Error('LIST_NOT_FOUND');
      }
      await pool.query(
        'DELETE FROM user_list_items WHERE list_id = ? AND anime_id = ?',
        [listId, animeId],
      );
    });
  }

  async setItemNote(
    userId: number,
    listId: number,
    animeId: number,
    note: string | null,
  ): Promise<void> {
    return withDbRetry(async () => {
      const list = await this.getList(userId, listId);
      if (!list) return;
      await pool.query(
        `UPDATE user_list_items SET note = ?
         WHERE list_id = ? AND anime_id = ?`,
        [note, listId, animeId],
      );
    });
  }
}
