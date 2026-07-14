import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl(process.env.SITE_URL);

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/admin',
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
