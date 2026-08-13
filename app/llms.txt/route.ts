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
- [Site search](${siteUrl}/search): searches videos and manga together; their tag systems stay separate.

## Content pages

- Video detail pages use /watch/{id} and expose the title, description, tags, media player, and related works.
- Manga detail pages use /manga/{slug} and expose the title, source label, description, cover, and reading entry point.
- Manga reading pages use /manga/{slug}/read/{number}; the detail page is the preferred summary URL.

## Indexing guidance

- The homepage, video catalog, manga catalog, and detail pages are server-rendered and may be indexed.
- Admin, account, history, favorites, authentication, API, search-result, and reader utility routes are not primary discovery pages.
- Content is provided by the site operator and should be attributed to the original rights holders where applicable.

## Site map

- [XML sitemap](${siteUrl}/sitemap.xml)
- [Robots policy](${siteUrl}/robots.txt)
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=900',
    },
  });
}
