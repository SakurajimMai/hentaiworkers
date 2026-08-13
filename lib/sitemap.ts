import type { MetadataRoute } from 'next';

export const MAX_SITEMAP_URLS = 50_000;

export type SitemapAnime = {
  id: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SitemapTag = {
  id: number;
  name: string;
};

export type SitemapManga = {
  id: number;
  slug: string;
  updatedAt: string | Date | null;
};

function normalizeBaseUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('SITE_URL 不能为空');
  }
  return normalized;
}

function validDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

/** Public indexable hubs that always appear in the sitemap. */
export const SITEMAP_STATIC_PATHS = ['/', '/browse', '/manga', '/privacy', '/terms'] as const;

export function assertSitemapEntryLimit(animeCount: number, tagCount: number, extra = 0) {
  const entryCount = SITEMAP_STATIC_PATHS.length + animeCount + tagCount + extra;

  if (entryCount > MAX_SITEMAP_URLS) {
    throw new Error('站点地图超过单文件 50,000 条 URL 上限，需要启用分片');
  }
}

export function buildSitemap(input: {
  baseUrl: string;
  now: Date;
  animes: readonly SitemapAnime[];
  tags: readonly SitemapTag[];
  mangas?: readonly SitemapManga[];
}): MetadataRoute.Sitemap {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const mangas = input.mangas ?? [];
  assertSitemapEntryLimit(input.animes.length, input.tags.length, mangas.length);

  const staticEntries: MetadataRoute.Sitemap = SITEMAP_STATIC_PATHS.map((path) => ({
    url: path === '/' ? `${baseUrl}/` : `${baseUrl}${path}`,
    lastModified: input.now,
    changeFrequency: path === '/privacy' || path === '/terms' ? ('yearly' as const) : ('daily' as const),
    priority: path === '/' ? 1 : path === '/browse' || path === '/manga' ? 0.9 : 0.3,
  }));

  return [
    ...staticEntries,
    ...input.animes.map((anime) => ({
      url: `${baseUrl}/watch/${anime.id}`,
      lastModified: validDate(anime.updatedAt ?? anime.createdAt, input.now),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...mangas.map((manga) => ({
      url: `${baseUrl}/manga/${manga.id}`,
      lastModified: validDate(manga.updatedAt ? String(manga.updatedAt) : null, input.now),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...input.tags.map((tag) => ({
      // Single query param keeps the XML loc free of raw `&`.
      url: `${baseUrl}/browse?tag=${tag.id}`,
      lastModified: input.now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
