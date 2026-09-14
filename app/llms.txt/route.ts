import { resolveSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

export function GET() {
  const siteUrl = resolveSiteUrl(process.env.SITE_URL);
  const body = `# AnimeStream

> AnimeStream is a Chinese-language media catalog for browsing hosted video works and reading published manga content.

## Public entry points

- [Home](${siteUrl}/): latest discovery and continue-watching entry points.
- [Browse videos](${siteUrl}/browse): searchable video catalog with latest and popular sorting.
- [Manga catalog](${siteUrl}/manga): published manga works with title search and manga-only tag filters.

## Content pages

- Video detail pages use /watch/{id} and expose the title, description, tags, media player, and related works.
- Manga detail pages use /manga/{slug} and expose the title, source label, description, cover, and reading entry point.
- Manga reading pages use /manga/{slug}/read/{number}; the detail page is the preferred summary URL.

## Indexing guidance

- The homepage, video catalog, manga catalog, and detail pages are server-rendered and may be indexed.
- Admin, account, history, favorites, authentication, API, search-result, and reader utility routes are disallowed in robots.txt and are not discovery pages.
- Content is provided by the site operator and should be attributed to the original rights holders where applicable.

## Site map

- [XML sitemap index](${siteUrl}/sitemap.xml): links the chunked section files under /sitemaps/ (pages, videos, manga, tags).
- [Robots policy](${siteUrl}/robots.txt)
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=900',
    },
  });
}
