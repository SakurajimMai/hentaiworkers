# Backend, database and image path audit

## Confirmed data path

- App/API: one Next.js Node standalone container.
- Database: external MySQL/MariaDB through Drizzle/mysql2.
- Image producer/storage: external to this repository. Formal data uses `image.ixacg.de` behind Cloudflare; underlying object storage is unknown.
- Android image path: app -> `/cdn-img` -> fixed image host; Web requests image URL directly.

## Confirmed findings

- Normal numeric chapter API performs about 9 SELECTs, including settings; concurrent Android detail adds about 4, for about 13 before local state.
- Required indexes exist: unique slug, manga/chapter number, chapter/page index. Missing indexes are not the confirmed root cause.
- `getChapter` calls `getMangaBySlug`, then reads the chapter and pages; the caller also resolves manga. Numeric ID first attempts slug.
- `recordMangaView` can execute two `CREATE TABLE IF NOT EXISTS` statements before identity and insert/upsert work; Web currently awaits it.
- Chapter response has no process cache or Cache-Control. Long caching is unsafe without publish/unpublish invalidation.
- `manga_pages` and publish contract contain URLs but no dimensions.
- `/cdn-img` streams and uses a 30-day Next fetch revalidation, but the App container has no persistent cache volume. Removing the proxy is outside scope because it previously fixed Android direct-CDN failures.

## Production baseline

| Sample | Result |
|---|---:|
| Latest 20-page chapter API, 5 runs | TTFB 115-248ms |
| 674-page chapter API, 3 runs | TTFB 130-152ms |
| 674-page JSON | 54,768B; gzip about 7.2KB |
| Proxy first image, cold | TTFB 0.959s; complete 1.800s |
| Same proxy image, warm | TTFB 0.030s; complete 0.045s |

The proxy measurement is server-side HTTP timing, not phone decode/readability timing.

## Unconfirmed

- Per-query production latency, pool saturation and geographic database distance.
- Whether Next fetch cache or Cloudflare accounts for each part of the cold/warm proxy delta.
- Upstream object storage and image producer behavior.
