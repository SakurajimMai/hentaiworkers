import type { MetadataRoute } from 'next';
import { listSitemapData } from '@/lib/anime-service';
import { resolveSiteUrl } from '@/lib/site-url';
import { buildSitemap } from '@/lib/sitemap';
import { isMangaEnabled, listPublishedMangaSitemapData } from '@/lib/manga-client';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await listSitemapData();
  let mangas: Awaited<ReturnType<typeof listPublishedMangaSitemapData>> = [];
  try {
    if (await isMangaEnabled()) mangas = await listPublishedMangaSitemapData();
  } catch {
    mangas = [];
  }

  return buildSitemap({
    baseUrl: resolveSiteUrl(process.env.SITE_URL),
    now: new Date(),
    animes: data.animes,
    tags: data.tags,
    mangas,
  });
}
