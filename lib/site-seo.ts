import type { Metadata } from 'next';
import { z } from 'zod';
import { ADULT_RATING_META, indexableRobots, SITE_LOCALE } from '@/lib/seo';

export const siteSeoSchema = z.object({
  title: z.string().trim().min(1).max(100).default('AnimeStream'),
  subtitle: z.string().trim().max(160).default('里番与漫画'),
  description: z.string().trim().max(500).default('AnimeStream 提供里番视频浏览、托管 MP4 播放、漫画在线阅读、观看进度同步与片单收藏。'),
  keywords: z.string().trim().max(1000).default('里番,在线观影,漫画阅读,AnimeStream'),
});
export type SiteSeo = z.infer<typeof siteSeoSchema>;

export function siteSeoTitle(seo: SiteSeo): string {
  return [seo.title, seo.subtitle].filter(Boolean).join(' · ');
}

export function buildSiteMetadata(seo: SiteSeo): Metadata {
  const title = siteSeoTitle(seo);
  return {
    title: { default: title, template: `%s · ${seo.title.replaceAll('%s', '％s')}` },
    description: seo.description,
    applicationName: seo.title,
    keywords: seo.keywords.split(/[,，\n]+/).map((word) => word.trim()).filter(Boolean),
    openGraph: {
      title,
      description: seo.description,
      type: 'website',
      locale: SITE_LOCALE,
      siteName: seo.title,
    },
    twitter: { card: 'summary_large_image', title, description: seo.description },
    robots: indexableRobots,
    other: ADULT_RATING_META,
  };
}

/** Legacy custom tags must not override metadata owned by the SEO settings or page. */
export function isManagedSeoMeta(key: string): boolean {
  const normalized = key.toLowerCase();
  return ['description', 'keywords', 'application-name', 'robots', 'googlebot', 'rating'].includes(normalized)
    || normalized.startsWith('og:') || normalized.startsWith('twitter:');
}
