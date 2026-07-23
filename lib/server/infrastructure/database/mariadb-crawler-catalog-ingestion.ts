import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getCrawlerSqlExecutor, type CrawlerSqlExecutor } from './mariadb-crawler-repositories';
import type {
  CatalogIngestionInput,
  CatalogIngestionPort,
  CatalogIngestionResult,
} from '../../crawler/ports/catalog-ingestion-port';
import { catalogTargetForSource } from '../../crawler/domain/catalog-target';
import { sha256Bytes } from '../../crawler/domain/hashing';

function normalizeTags(tags: readonly string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 100);
}

function normalizeFanart(urls: readonly string[] | undefined): string | null {
  const normalized = [...new Set((urls ?? []).map((url) => url.trim()).filter(Boolean))];
  return normalized.length ? normalized.join(',') : null;
}

function streamFormatFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8')) return 'hls';
  if (lower.includes('.mp4')) return 'mp4';
  if (lower.includes('.mpd')) return 'dash';
  return 'external';
}

function isDuplicateEntry(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === 'ER_DUP_ENTRY' || /Duplicate entry/i.test(message);
}

async function ensureLegacyCategory(executor: CrawlerSqlExecutor): Promise<number> {
  const [rows] = await executor.query(
    'SELECT id FROM categories WHERE name = ? ORDER BY id ASC LIMIT 1',
    ['里番'],
  );
  const existing = Number((rows as RowDataPacket[])[0]?.id ?? 0);
  if (existing) return existing;
  const [insert] = await executor.query(
    `INSERT INTO categories (name, num, created_at, updated_at)
     VALUES ('里番', 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
  );
  return Number((insert as ResultSetHeader).insertId);
}

async function updateLegacyAnime(
  executor: CrawlerSqlExecutor,
  animeId: number,
  input: CatalogIngestionInput,
  fanart: string | null,
  categoryId: number,
): Promise<void> {
  await executor.query(
    `UPDATE animes SET
      title = ?,
      title_english = COALESCE(?, title_english),
      title_japanese = COALESCE(?, title_japanese),
      description = COALESCE(?, description),
      cover = COALESCE(?, cover),
      fanart = COALESCE(?, fanart),
      video_url = ?,
      release_year = COALESCE(?, release_year),
      release_date = COALESCE(?, release_date),
      category_id = COALESCE(category_id, ?),
      is_active = 1,
      updated_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [
      input.title,
      input.titleEnglish ?? null,
      input.titleJapanese ?? null,
      input.description ?? null,
      input.coverUrl ?? null,
      fanart,
      input.videoUrl,
      input.releaseYear ?? null,
      input.releaseDate ?? null,
      categoryId,
      animeId,
    ],
  );
}

async function findLegacyMapping(
  executor: CrawlerSqlExecutor,
  source: string,
  sourceId: string,
): Promise<number> {
  const [rows] = await executor.query(
    'SELECT anime_id FROM anime_sources WHERE source = ? AND source_id = ? LIMIT 1 FOR UPDATE',
    [source, sourceId],
  );
  return Number((rows as RowDataPacket[])[0]?.anime_id ?? 0);
}

async function replaceLegacyTags(
  executor: CrawlerSqlExecutor,
  animeId: number,
  tagNames: readonly string[],
): Promise<void> {
  await executor.query('DELETE FROM anime_tags WHERE anime_id = ?', [animeId]);
  for (const tagName of tagNames) {
    await executor.query(
      `INSERT INTO tags (name, created_at, updated_at)
       VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
      [tagName],
    );
    const [tagRows] = await executor.query('SELECT id FROM tags WHERE name = ? LIMIT 1', [
      tagName,
    ]);
    const tagId = Number((tagRows as RowDataPacket[])[0]?.id ?? 0);
    if (tagId) {
      await executor.query(
        `INSERT INTO anime_tags (anime_id, tag_id, created_at, updated_at)
         VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
        [animeId, tagId],
      );
    }
  }
}

async function upsertLegacyAnimes(
  executor: CrawlerSqlExecutor,
  input: CatalogIngestionInput,
): Promise<CatalogIngestionResult> {
  const fanart = normalizeFanart(input.fanartUrls);
  const categoryId = await ensureLegacyCategory(executor);
  let animeId = await findLegacyMapping(executor, input.source, input.sourceId);
  let created = false;

  if (animeId > 0) {
    await updateLegacyAnime(executor, animeId, input, fanart, categoryId);
  } else {
    const [insertResult] = await executor.query(
      `INSERT INTO animes (
        title, title_english, title_japanese, description, cover, fanart, video_url,
        release_year, release_date, view_count, favorite_count, is_active, category_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [
        input.title,
        input.titleEnglish ?? null,
        input.titleJapanese ?? null,
        input.description ?? null,
        input.coverUrl ?? null,
        fanart,
        input.videoUrl,
        input.releaseYear ?? null,
        input.releaseDate ?? null,
        categoryId,
      ],
    );
    const insertedAnimeId = Number((insertResult as ResultSetHeader).insertId);
    if (!insertedAnimeId) throw new Error('Crawler catalog insert did not return an anime id');

    try {
      await executor.query(
        `INSERT INTO anime_sources (anime_id, source, source_id, source_key_hash)
         VALUES (?, ?, ?, ?)`,
        [
          insertedAnimeId,
          input.source,
          input.sourceId,
          Buffer.from(sha256Bytes(`${input.source}\0${input.sourceId}`)),
        ],
      );
      animeId = insertedAnimeId;
      created = true;
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
      await executor.query('DELETE FROM animes WHERE id = ?', [insertedAnimeId]);
      animeId = await findLegacyMapping(executor, input.source, input.sourceId);
      if (!animeId) throw error;
      await updateLegacyAnime(executor, animeId, input, fanart, categoryId);
    }
  }

  await replaceLegacyTags(executor, animeId, normalizeTags(input.tags));
  return { kind: 'upserted', animeId, created, target: 'legacy_animes' };
}

async function updateWork(
  executor: CrawlerSqlExecutor,
  workId: number,
  input: CatalogIngestionInput,
  fanart: string | null,
  streamFormat: string,
): Promise<void> {
  await executor.query(
    `UPDATE anime_works SET
      title = ?,
      title_english = COALESCE(?, title_english),
      title_japanese = COALESCE(?, title_japanese),
      description = COALESCE(?, description),
      cover_url = COALESCE(?, cover_url),
      fanart_urls = COALESCE(?, fanart_urls),
      stream_url = ?,
      stream_format = ?,
      play_lines_json = COALESCE(?, play_lines_json),
      release_year = COALESCE(?, release_year),
      release_date = COALESCE(?, release_date),
      remarks = COALESCE(?, remarks),
      actors = COALESCE(?, actors),
      directors = COALESCE(?, directors),
      aliases = COALESCE(?, aliases),
      area = COALESCE(?, area),
      lang = COALESCE(?, lang),
      source_updated_at = COALESCE(?, source_updated_at),
      is_active = 1,
      updated_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [
      input.title,
      input.titleEnglish ?? null,
      input.titleJapanese ?? null,
      input.description ?? null,
      input.coverUrl ?? null,
      fanart,
      input.videoUrl,
      streamFormat,
      input.playLines?.length ? JSON.stringify(input.playLines) : null,
      input.releaseYear ?? null,
      input.releaseDate ?? null,
      input.remarks ?? null,
      input.actors ?? null,
      input.directors ?? null,
      input.aliases ?? null,
      input.area ?? null,
      input.lang ?? null,
      input.sourceUpdatedAt ?? null,
      workId,
    ],
  );
}

async function findWorkMapping(
  executor: CrawlerSqlExecutor,
  source: string,
  sourceId: string,
): Promise<number> {
  const [rows] = await executor.query(
    'SELECT work_id FROM anime_work_sources WHERE source = ? AND source_id = ? LIMIT 1 FOR UPDATE',
    [source, sourceId],
  );
  return Number((rows as RowDataPacket[])[0]?.work_id ?? 0);
}

async function replaceWorkTags(
  executor: CrawlerSqlExecutor,
  workId: number,
  tagNames: readonly string[],
): Promise<void> {
  // 动漫标签字典与里番 tags 表分离，只写 work_tags。
  await executor.query('DELETE FROM anime_work_tags WHERE work_id = ?', [workId]);
  for (const tagName of tagNames) {
    await executor.query(
      `INSERT INTO work_tags (name, created_at, updated_at)
       VALUES (?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
      [tagName],
    );
    const [tagRows] = await executor.query(
      'SELECT id FROM work_tags WHERE name = ? LIMIT 1',
      [tagName],
    );
    const tagId = Number((tagRows as RowDataPacket[])[0]?.id ?? 0);
    if (tagId) {
      await executor.query(
        `INSERT INTO anime_work_tags (work_id, tag_id, created_at, updated_at)
         VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
        [workId, tagId],
      );
    }
  }
}

/**
 * External-link-only path for MacCMS JP/KR anime.
 * Writes stream URL metadata only — never reserves object storage or downloads files.
 */
async function upsertAnimeWorks(
  executor: CrawlerSqlExecutor,
  input: CatalogIngestionInput,
): Promise<CatalogIngestionResult> {
  const fanart = normalizeFanart(input.fanartUrls);
  const streamFormat = streamFormatFromUrl(input.videoUrl);
  let workId = await findWorkMapping(executor, input.source, input.sourceId);
  let created = false;

  if (workId > 0) {
    await updateWork(executor, workId, input, fanart, streamFormat);
  } else {
    const [insertResult] = await executor.query(
      `INSERT INTO anime_works (
        title, title_english, title_japanese, description, cover_url, fanart_urls,
        stream_url, stream_format, play_lines_json, release_year, release_date, remarks,
        actors, directors, aliases, area, lang, source_updated_at,
        is_active, view_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [
        input.title,
        input.titleEnglish ?? null,
        input.titleJapanese ?? null,
        input.description ?? null,
        input.coverUrl ?? null,
        fanart,
        input.videoUrl,
        streamFormat,
        input.playLines?.length ? JSON.stringify(input.playLines) : null,
        input.releaseYear ?? null,
        input.releaseDate ?? null,
        input.remarks ?? null,
        input.actors ?? null,
        input.directors ?? null,
        input.aliases ?? null,
        input.area ?? null,
        input.lang ?? null,
        input.sourceUpdatedAt ?? null,
      ],
    );
    const insertedWorkId = Number((insertResult as ResultSetHeader).insertId);
    if (!insertedWorkId) throw new Error('Crawler work insert did not return an id');

    try {
      await executor.query(
        `INSERT INTO anime_work_sources (work_id, source, source_id, source_key_hash)
         VALUES (?, ?, ?, ?)`,
        [
          insertedWorkId,
          input.source,
          input.sourceId,
          Buffer.from(sha256Bytes(`${input.source}\0${input.sourceId}`)),
        ],
      );
      workId = insertedWorkId;
      created = true;
    } catch (error) {
      if (!isDuplicateEntry(error)) throw error;
      await executor.query('DELETE FROM anime_works WHERE id = ?', [insertedWorkId]);
      workId = await findWorkMapping(executor, input.source, input.sourceId);
      if (!workId) throw error;
      await updateWork(executor, workId, input, fanart, streamFormat);
    }
  }

  await replaceWorkTags(executor, workId, normalizeTags(input.tags));
  return {
    kind: 'upserted',
    animeId: workId,
    workId,
    created,
    target: 'anime_works',
  };
}

export class MariaDbCrawlerCatalogIngestion implements CatalogIngestionPort {
  async findExistingBySource(
    source: string,
    sourceId: string,
  ): Promise<CatalogIngestionResult | null> {
    const executor = getCrawlerSqlExecutor();
    const target = catalogTargetForSource(source);
    if (target === 'anime_works') {
      const [rows] = await executor.query(
        'SELECT work_id FROM anime_work_sources WHERE source = ? AND source_id = ? LIMIT 1',
        [source, sourceId],
      );
      const workId = Number((rows as RowDataPacket[])[0]?.work_id ?? 0);
      return workId
        ? { kind: 'upserted', animeId: workId, workId, created: false, target: 'anime_works' }
        : null;
    }
    const [rows] = await executor.query(
      'SELECT anime_id FROM anime_sources WHERE source = ? AND source_id = ? LIMIT 1',
      [source, sourceId],
    );
    const animeId = Number((rows as RowDataPacket[])[0]?.anime_id ?? 0);
    return animeId
      ? { kind: 'upserted', animeId, created: false, target: 'legacy_animes' }
      : null;
  }

  async upsertFromCrawler(input: CatalogIngestionInput): Promise<CatalogIngestionResult> {
    const executor = getCrawlerSqlExecutor();
    const target = catalogTargetForSource(input.source);
    if (target === 'anime_works') {
      return upsertAnimeWorks(executor, input);
    }
    return upsertLegacyAnimes(executor, input);
  }
}
