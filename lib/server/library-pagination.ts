import type { RowDataPacket } from 'mysql2';
import { withConsistentRead } from '@/lib/db';
import { ensureMangaProgressSchema } from '@/lib/server/manga-progress';
import {
  getPageWindow,
  LIBRARY_PAGE_SIZE,
  type PageResult,
} from '@/lib/server/shared/pagination';

export type AnimeHistoryItem = Readonly<{
  kind: 'anime';
  recordId: number;
  animeId: number;
  title: string;
  cover: string | null;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  activityAt: string;
}>;

export type MangaHistoryItem = Readonly<{
  kind: 'manga';
  recordId: number;
  mangaId: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  chapterNumber: number;
  pageIndex: number;
  activityAt: string;
}>;

export type LibraryHistoryItem = AnimeHistoryItem | MangaHistoryItem;

export interface LibraryHistoryPageRepository {
  listPageForUser(
    userId: number,
    requestedPage: number,
    pageSize: number,
  ): Promise<PageResult<LibraryHistoryItem>>;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value ?? '');
  if (raw.includes('T')) return raw;
  const parsed = new Date(`${raw.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function mapHistoryRow(row: RowDataPacket): LibraryHistoryItem {
  const common = {
    recordId: Number(row.record_id),
    title: String(row.title ?? ''),
    activityAt: asIso(row.activity_at),
  };

  if (row.kind === 'manga') {
    return {
      kind: 'manga',
      ...common,
      mangaId: Number(row.item_id),
      slug: String(row.slug ?? ''),
      coverUrl: row.cover_url == null ? null : String(row.cover_url),
      chapterNumber: Number(row.chapter_number ?? 1),
      pageIndex: Number(row.page_index ?? 0),
    };
  }

  return {
    kind: 'anime',
    ...common,
    animeId: Number(row.item_id),
    cover: row.cover_url == null ? null : String(row.cover_url),
    positionSeconds: Number(row.position_seconds ?? 0),
    durationSeconds: Number(row.duration_seconds ?? 0),
    completed: Number(row.completed ?? 0) === 1,
  };
}

class MariaDbLibraryHistoryPageRepository implements LibraryHistoryPageRepository {
  async listPageForUser(
    userId: number,
    requestedPage: number,
    pageSize: number,
  ): Promise<PageResult<LibraryHistoryItem>> {
    await ensureMangaProgressSchema();
    return withConsistentRead(async (connection) => {
      const [countRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM (
           SELECT p.id
           FROM user_watch_progress p
           INNER JOIN animes a ON a.id = p.anime_id
           WHERE p.user_id = ?
           UNION ALL
           SELECT p.id
           FROM manga_reading_progress p
           INNER JOIN mangas m ON m.id = p.manga_id
           WHERE p.user_id = ? AND m.is_published = 1
         ) history_rows`,
        [userId, userId],
      );
      const total = Math.max(0, Number(countRows[0]?.total ?? 0));
      const window = getPageWindow(requestedPage, total, pageSize);

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
        `SELECT kind, record_id, item_id, slug, title, cover_url,
                position_seconds, duration_seconds, completed,
                chapter_number, page_index, activity_at
         FROM (
           SELECT 'anime' AS kind, p.id AS record_id, p.anime_id AS item_id,
                  NULL AS slug, a.title, a.cover AS cover_url,
                  p.position_seconds, p.duration_seconds, p.completed,
                  NULL AS chapter_number, NULL AS page_index,
                  p.last_watched_at AS activity_at
           FROM user_watch_progress p
           INNER JOIN animes a ON a.id = p.anime_id
           WHERE p.user_id = ?
           UNION ALL
           SELECT 'manga' AS kind, p.id AS record_id, p.manga_id AS item_id,
                  m.slug, m.title, m.cover_url,
                  NULL AS position_seconds, NULL AS duration_seconds, NULL AS completed,
                  p.chapter_number, p.page_index, p.last_read_at AS activity_at
           FROM manga_reading_progress p
           INNER JOIN mangas m ON m.id = p.manga_id
           WHERE p.user_id = ? AND m.is_published = 1
         ) history_rows
         ORDER BY activity_at DESC, kind ASC, record_id DESC
         LIMIT ? OFFSET ?`,
        [userId, userId, window.pageSize, window.offset],
      );
      return {
        items: rows.map(mapHistoryRow),
        page: window.page,
        pageSize: window.pageSize,
        total: window.total,
        totalPages: window.totalPages,
      };
    });
  }
}

const mariaDbRepository = new MariaDbLibraryHistoryPageRepository();

export async function listLibraryHistoryPage(
  userId: number,
  requestedPage: number,
  pageSize = LIBRARY_PAGE_SIZE,
  repository: LibraryHistoryPageRepository = mariaDbRepository,
): Promise<PageResult<LibraryHistoryItem>> {
  return repository.listPageForUser(userId, requestedPage, pageSize);
}
