/**
 * Site-facing manga catalog.
 * Data lives in the app MySQL tables and is ingested via POST /api/manga/publish
 * using the publish key configured in Admin → 系统设置 (not MANGA_API_URL / .env).
 */
export {
  listMangas,
  listPublishedMangaSitemapData,
  getMangaBySlug as getManga,
  getChapter,
  getMangaReaderData,
  type MangaSummary,
  type MangaDetail,
  type ChapterSummary,
  type ChapterDetail,
  type MangaReaderData,
  type MangaPage,
  type MangaListResult as MangaListResponse,
} from '@/lib/manga-service';

export { mangaTagHref, normalizeMangaTagQuery } from '@/lib/manga-tags';

import { listTopMangaTags } from '@/lib/manga-service';
import { getSystemSettingsService } from '@/lib/server/system';

/** Public manga section enabled flag from system settings. */
export async function isMangaEnabled(): Promise<boolean> {
  try {
    return await getSystemSettingsService().isMangaEnabled();
  } catch {
    return true;
  }
}

/**
 * Quick-filter tags for /manga: admin-curated tags first (their order),
 * then most-used published tags, deduped and capped.
 */
export async function listMangaFilterTags(limit = 24): Promise<string[]> {
  try {
    const [settings, topTags] = await Promise.all([
      getSystemSettingsService().getSettings(),
      listTopMangaTags(limit),
    ]);
    const merged: string[] = [];
    for (const tag of [...settings.manga.curatedTags, ...topTags]) {
      if (!merged.includes(tag)) merged.push(tag);
      if (merged.length >= limit) break;
    }
    return merged;
  } catch {
    return [];
  }
}
