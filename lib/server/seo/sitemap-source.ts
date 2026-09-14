import { listSitemapData } from '@/lib/anime-service';
import { isMangaEnabled, listCuratedMangaTags, listPublishedMangaSitemapData } from '@/lib/manga-client';
import { resolveSiteUrl } from '@/lib/site-url';
import { StaleReadCache } from '@/lib/server/shared/stale-read-cache';
import type { SitemapSource } from '@/lib/sitemap';

const SITEMAP_SOURCE_KEY = 'sitemap-source';

/**
 * One shared snapshot feeds the index and every child file, so a crawler walking all sections
 * does not repeat the catalog queries per request. Stale data is served while a refresh runs.
 */
const sitemapSourceCache = new StaleReadCache<SitemapSource>({
  maxEntries: 1,
  freshTtlMs: 10 * 60_000,
  staleTtlMs: 6 * 60 * 60_000,
  retryDelayMs: 30_000,
  onBackgroundError: (error) => console.error('[sitemap] refresh failed', error),
});

async function loadSitemapSource(): Promise<SitemapSource> {
  const catalog = await listSitemapData();
  // A disabled manga section legitimately has no URLs. A *failed* manga query must propagate:
  // StaleReadCache would otherwise commit the empty result as fresh for the full window, and
  // /sitemaps/mangas-1.xml would 404 while the index stopped listing it.
  const enabled = await isMangaEnabled();
  const [mangas, mangaTags] = enabled
    ? await Promise.all([listPublishedMangaSitemapData(), listCuratedMangaTags()])
    : [[], [] as readonly string[]];
  return { animes: catalog.animes, tags: catalog.tags, mangas, mangaTags };
}

export function getSitemapSource(): Promise<SitemapSource> {
  return sitemapSourceCache.get(SITEMAP_SOURCE_KEY, loadSitemapSource);
}

export function resetSitemapSourceForTests(): void {
  sitemapSourceCache.clear();
}

export function sitemapBaseUrl(): string {
  return resolveSiteUrl(process.env.SITE_URL);
}
