import type { MetadataRoute } from 'next';
import { resolveSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl(process.env.SITE_URL);

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/api',
          '/login',
          '/register',
          '/reset-password',
          '/forgot-password',
          '/history',
          '/favorites',
          '/account',
          '/verify-email',
        ],
      },
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'],
        allow: ['/', '/browse', '/watch', '/manga', '/llms.txt'],
        disallow: ['/admin', '/api', '/login', '/register', '/history', '/favorites', '/account'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
