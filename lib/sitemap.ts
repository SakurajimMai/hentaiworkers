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

export function assertSitemapEntryLimit(animeCount: number, tagCount: number) {
  const entryCount = 2 + animeCount + tagCount;

  if (entryCount > MAX_SITEMAP_URLS) {
    throw new Error('站点地图超过单文件 50,000 条 URL 上限，需要启用分片');
  }
}

export function buildSitemap(input: {
  baseUrl: string;
  now: Date;
  animes: readonly SitemapAnime[];
  tags: readonly SitemapTag[];
}): MetadataRoute.Sitemap {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  assertSitemapEntryLimit(input.animes.length, input.tags.length);

  return [
    {
      url: `${baseUrl}/`,
      lastModified: input.now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/browse`,
      lastModified: input.now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...input.animes.map((anime) => ({
      url: `${baseUrl}/watch/${anime.id}`,
      lastModified: validDate(anime.updatedAt ?? anime.createdAt, input.now),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...input.tags.map((tag) => ({
      url: `${baseUrl}/browse?tag=${tag.id}&tagName=${encodeURIComponent(tag.name)}`,
      lastModified: input.now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
