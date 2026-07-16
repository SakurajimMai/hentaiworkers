import type { RowDataPacket } from 'mysql2';
import { pool } from '@/lib/db';
import type {
  AnimeWorkDetail,
  AnimeWorkListQuery,
  AnimeWorkPage,
  AnimeWorkSummary,
  AnimeWorkUpdateInput,
} from '../../works/domain/models';
import type { WorksRepository } from '../../works/ports/works-repository';

function asIso(value: unknown): string {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  if (s.includes('T')) return s;
  return s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z');
}


function parsePlayLines(raw: unknown): import('../../works/domain/models').WorkPlayLine[] {
  if (raw == null || raw === '') return [];
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const lines: import('../../works/domain/models').WorkPlayLine[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const name = String(rec.name ?? rec.flag ?? '').trim();
    const flag = String(rec.flag ?? rec.name ?? '').trim() || name;
    const episodesRaw = Array.isArray(rec.episodes) ? rec.episodes : [];
    const episodes = episodesRaw
      .map((ep) => {
        if (!ep || typeof ep !== 'object') return null;
        const e = ep as Record<string, unknown>;
        const en = String(e.name ?? '').trim();
        const url = String(e.url ?? '').trim();
        if (!en || !url) return null;
        return { name: en, url };
      })
      .filter((x): x is { name: string; url: string } => !!x);
    if (name && episodes.length) lines.push({ name, flag, episodes });
  }
  return lines;
}

function mapSummary(
  row: RowDataPacket,
  sources: ReadonlyArray<{ source: string; sourceId: string }>,
): AnimeWorkSummary {
  const playLines = parsePlayLines(row.play_lines_json);
  const episodeCount = playLines.reduce((sum, line) => sum + line.episodes.length, 0);
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    titleEnglish: row.title_english == null ? null : String(row.title_english),
    titleJapanese: row.title_japanese == null ? null : String(row.title_japanese),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    streamUrl: String(row.stream_url ?? ''),
    streamFormat: String(row.stream_format ?? 'external'),
    releaseYear: row.release_year == null ? null : Number(row.release_year),
    remarks: row.remarks == null ? null : String(row.remarks),
    actors: row.actors == null ? null : String(row.actors),
    directors: row.directors == null ? null : String(row.directors),
    aliases: row.aliases == null ? null : String(row.aliases),
    area: row.area == null ? null : String(row.area),
    lang: row.lang == null ? null : String(row.lang),
    sourceUpdatedAt: row.source_updated_at == null ? null : String(row.source_updated_at),
    isActive: Number(row.is_active) === 1,
    viewCount: Number(row.view_count ?? 0),
    updatedAt: asIso(row.updated_at),
    sources,
    playLineCount: playLines.length,
    episodeCount,
  };
}

export class MariaDbWorksRepository implements WorksRepository {
  async list(query: AnimeWorkListQuery = {}): Promise<AnimeWorkPage> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 24));
    const offset = (page - 1) * limit;
    const activeOnly = query.activeOnly !== false;
    const search = query.search?.trim() ?? '';
    const source = query.source?.trim() ?? '';

    const where: string[] = [];
    const params: unknown[] = [];
    if (activeOnly) {
      where.push('w.is_active = 1');
    }
    if (search) {
      where.push(
        '(w.title LIKE ? OR w.title_english LIKE ? OR w.title_japanese LIKE ? OR w.description LIKE ?)',
      );
      const like = `%${search.replace(/[%_]/g, '\\$&')}%`;
      params.push(like, like, like, like);
    }
    if (source) {
      where.push(
        'EXISTS (SELECT 1 FROM anime_work_sources s WHERE s.work_id = w.id AND s.source = ?)',
      );
      params.push(source);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM anime_works w ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.c ?? 0);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT w.*
       FROM anime_works w
       ${whereSql}
       ORDER BY w.updated_at DESC, w.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const ids = rows.map((row) => Number(row.id));
    const sourcesByWork = await this.loadSources(ids);
    const data = rows.map((row) =>
      mapSummary(row, sourcesByWork.get(Number(row.id)) ?? []),
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    };
  }

  async getById(
    id: number,
    options?: { activeOnly?: boolean },
  ): Promise<AnimeWorkDetail | null> {
    if (!Number.isInteger(id) || id <= 0) return null;
    const activeOnly = options?.activeOnly === true;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM anime_works WHERE id = ? ${activeOnly ? 'AND is_active = 1' : ''} LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;

    const sources = (await this.loadSources([id])).get(id) ?? [];
    const [tagRows] = await pool.query<RowDataPacket[]>(
      `SELECT t.id, t.name
       FROM anime_work_tags wt
       INNER JOIN work_tags t ON t.id = wt.tag_id
       WHERE wt.work_id = ?
       ORDER BY t.name ASC`,
      [id],
    );
    const fanart = String(row.fanart_urls ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    return {
      ...mapSummary(row, sources),
      description: row.description == null ? null : String(row.description),
      fanartUrls: fanart,
      releaseDate: row.release_date == null ? null : String(row.release_date),
      createdAt: asIso(row.created_at),
      tags: tagRows.map((t) => ({ id: Number(t.id), name: String(t.name) })),
      playLines: parsePlayLines(row.play_lines_json),
    };
  }

  async setActive(id: number, isActive: boolean): Promise<void> {
    await pool.query(
      'UPDATE anime_works SET is_active = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
      [isActive ? 1 : 0, id],
    );
  }

  async setActiveMany(ids: readonly number[], isActive: boolean): Promise<number> {
    if (!ids.length) return 0;
    const [result] = await pool.query(
      'UPDATE anime_works SET is_active = ?, updated_at = UTC_TIMESTAMP() WHERE id IN (?)',
      [isActive ? 1 : 0, ids],
    );
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  }

  async delete(id: number): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM anime_work_tags WHERE work_id = ?', [id]);
      await conn.query('DELETE FROM anime_work_sources WHERE work_id = ?', [id]);
      const [result] = await conn.query('DELETE FROM anime_works WHERE id = ?', [id]);
      const affected = Number((result as { affectedRows?: number }).affectedRows ?? 0);
      await conn.commit();
      return affected > 0;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async deleteMany(ids: readonly number[]): Promise<number> {
    if (!ids.length) return 0;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM anime_work_tags WHERE work_id IN (?)', [ids]);
      await conn.query('DELETE FROM anime_work_sources WHERE work_id IN (?)', [ids]);
      const [result] = await conn.query('DELETE FROM anime_works WHERE id IN (?)', [ids]);
      const affected = Number((result as { affectedRows?: number }).affectedRows ?? 0);
      await conn.commit();
      return affected;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async update(id: number, input: AnimeWorkUpdateInput): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        `UPDATE anime_works SET
           title = ?,
           title_english = ?,
           title_japanese = ?,
           description = ?,
           cover_url = ?,
           fanart_urls = ?,
           stream_url = ?,
           stream_format = ?,
           play_lines_json = ?,
           release_year = ?,
           release_date = ?,
           remarks = ?,
           actors = ?,
           directors = ?,
           aliases = ?,
           area = ?,
           lang = ?,
           source_updated_at = ?,
           is_active = ?,
           updated_at = UTC_TIMESTAMP()
         WHERE id = ?`,
        [
          input.title,
          input.titleEnglish,
          input.titleJapanese,
          input.description,
          input.coverUrl,
          input.fanartUrls.length ? input.fanartUrls.join(',') : null,
          input.streamUrl,
          input.streamFormat,
          input.playLines.length ? JSON.stringify(input.playLines) : null,
          input.releaseYear,
          input.releaseDate,
          input.remarks,
          input.actors,
          input.directors,
          input.aliases,
          input.area,
          input.lang,
          input.sourceUpdatedAt,
          input.isActive ? 1 : 0,
          id,
        ],
      );
      const affected = Number((result as { affectedRows?: number }).affectedRows ?? 0);
      if (affected === 0) {
        await conn.rollback();
        return;
      }

      await conn.query('DELETE FROM anime_work_tags WHERE work_id = ?', [id]);
      for (const tagId of input.tagIds) {
        // Only accept ids that exist in work_tags (never legacy tags).
        const [exists] = await conn.query<RowDataPacket[]>(
          'SELECT id FROM work_tags WHERE id = ? LIMIT 1',
          [tagId],
        );
        if (!exists[0]) continue;
        await conn.query(
          `INSERT INTO anime_work_tags (work_id, tag_id, created_at, updated_at)
           VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          [id, tagId],
        );
      }

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  private async loadSources(
    workIds: readonly number[],
  ): Promise<Map<number, Array<{ source: string; sourceId: string }>>> {
    const map = new Map<number, Array<{ source: string; sourceId: string }>>();
    if (workIds.length === 0) return map;
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT work_id, source, source_id
       FROM anime_work_sources
       WHERE work_id IN (?)
       ORDER BY id ASC`,
      [workIds],
    );
    for (const row of rows) {
      const workId = Number(row.work_id);
      const list = map.get(workId) ?? [];
      list.push({ source: String(row.source), sourceId: String(row.source_id) });
      map.set(workId, list);
    }
    return map;
  }
}

let singleton: MariaDbWorksRepository | undefined;

export function getMariaDbWorksRepository(): MariaDbWorksRepository {
  if (!singleton) singleton = new MariaDbWorksRepository();
  return singleton;
}
