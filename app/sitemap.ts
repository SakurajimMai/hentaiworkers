import type { MetadataRoute } from 'next';
import { listSitemapData } from '@/lib/anime-service';
import { resolveSiteUrl } from '@/lib/site-url';
import { buildSitemap } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await listSitemapData();

  return buildSitemap({
    baseUrl: resolveSiteUrl(process.env.SITE_URL),
    now: new Date(),
    animes: data.animes,
    tags: data.tags,
  });
}
