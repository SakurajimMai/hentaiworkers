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
          '/ads/',
          '/search',
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
        disallow: ['/admin', '/api', '/ads/', '/search', '/login', '/register', '/history', '/favorites', '/account'],
      },
    ],
    // Index file; the chunked section files live under /sitemaps/*.xml.
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
