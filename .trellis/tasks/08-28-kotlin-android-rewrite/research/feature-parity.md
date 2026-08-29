# Existing Mobile Feature Inventory

Baseline inspected at repository commit `220e63b` on 2026-08-28. The Expo client contains about 6,248 non-vendored TypeScript/TSX lines plus bundled ArtPlayer/HLS JavaScript.

## Navigation And Screens

| Current route | User-visible behavior | Native destination |
|---|---|---|
| `(tabs)/index` | Popular anime first page, manga horizontal entry, pull refresh, feed ads | Home |
| `(tabs)/discover` | Anime search, optional tag id/name, 30-item infinite pages, dedupe, refresh | Discover |
| `(tabs)/tags` | Popular tag grid; hidden from current tab bar but route exists | Discover tag selector/deep link |
| `(tabs)/manga` | Search title/author/tag, latest/day/week/month/all, 24-item infinite pages, refresh, ads | Manga |
| `(tabs)/history` | Anime+manga merged by timestamp, edit/remove, clear all, continue destination | Library / History |
| `(tabs)/favorites` | Separate anime/manga grids, edit/remove, cloud/local explanation | Library / Favorites |
| `(tabs)/account` | Session hydrate, current user, login/logout | Account |
| `login` | Username/email + password, validation, error, busy state | Login modal/screen |
| `detail/[id]` | Anime detail, play, favorite, tags, still gallery/lightbox, similar | Anime detail |
| `player/[id]` | Forced landscape full-screen ArtPlayer, MP4/HLS, ads, retry | Native player |
| `manga-detail/[id]` | Manga metadata, favorite, chapters, recommendations | Manga detail |
| `manga-reader/[id]/[number]` | Continuous vertical pages, temporary zoom, chrome, slider, chapter sheet, progress, ads | Native reader |

The tab bar currently exposes six destinations: 首页、发现、漫画、历史、收藏、我的. The native plan groups 历史 and 收藏 under 书架 to meet compact Android navigation constraints without removing either capability.

## API Operations

Public catalog:

- `GET /api/animes?page&limit&tag&search&sort`
- `GET /api/animes/{id}`
- `GET /api/animes/{id}/similar`
- `GET /api/tags?limit`
- `GET /api/mangas?page&limit&q&tag&rank`
- `GET /api/mangas/{id}`
- `GET /api/mangas/{id}/chapters/{number}`
- `GET /api/ads`

Identity and library:

- `POST /api/auth/login` with `{ emailOrUsername, password }`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET|POST /api/me/favorites`
- `GET|POST|DELETE /api/me/watch-progress`
- `PUT|DELETE /api/me/watch-progress/{animeId}`
- `GET|POST|DELETE /api/me/manga-progress`
- `PUT|DELETE /api/me/manga-progress/{mangaId}`

The current client stores and manually sends `animestream_session` from `Set-Cookie`. Error payloads may be a string or an object containing `message`.

## Local Data Semantics

AsyncStorage keys:

| Key | Shape | Behavior |
|---|---|---|
| `@auth/cookie` | cookie string | Persisted session |
| `@anime/history` | JSON array | Most recent first, unique by anime id, max 50 |
| `@anime/favorites` | JSON array | Unique by anime id |
| `@manga/history` | JSON array | Most recent first, unique by manga id, chapter stored, max 50 |
| `@manga/favorites` | JSON array | Unique by manga id |

Android AsyncStorage 2.2 defaults to SQLite database `RKStorage`, table `catalystLocalStorage(key TEXT PRIMARY KEY, value TEXT NOT NULL)`. The generated app does not enable `AsyncStorage_useNextStorage`, so the native importer can read this schema directly after a same-package/same-signature upgrade.

Logged-out reads/writes are local. Logged-in list reads prefer cloud and fall back to local. Favorite toggles prefer cloud and update a local mirror. Login triggers best-effort upload of all local favorites and both histories. Anime playback currently records position `1`, duration `0`; manga reading records chapter and page index.

## Media Rules

- API origin defaults to `https://www.ixacg.de`; non-http(s) or malformed origins fall back to default.
- `image.ixacg.de` is rewritten to `${origin}/cdn-img/<path><query>`.
- Image requests use an image Accept header and `${origin}/` Referer.
- `fanart` may be a comma-separated URL list.
- Anime detail still gallery deduplicates cover plus fanart URLs.
- Player recognizes HLS by `.m3u8` before query string; other sources use normal video playback.

## Advertising Rules

- Ads failures produce an all-disabled config and do not block content.
- Feed ads include each enabled slot after every clamped interval `1..40` content items.
- Feed HTML renders in WebView; a non-HTML slot can open `href` externally.
- Reader currently uses only configured top and bottom slots; middle is intentionally ignored.
- Pre-roll supports video, HTML or image, click URL, mute, total duration and close delay.
- Pause ad supports video, HTML or image, click URL and mute; it does not show at natural playback end.

## Reader Details

- Loads manga detail and chapter concurrently.
- Normalizes and filters page URLs, prefetches the first four images.
- Continuous vertical list, current page from first item at least 40% visible.
- Progress write is debounced about 800ms.
- A short stationary tap toggles chrome; scrolling hides it; zoom blocks tap toggle.
- Chrome contains back, title/chapter, favorite, directory, previous/next chapter and page scrubber.
- Reader has top/bottom ads and end-of-chapter text.

## Tests And Documentation Coupled To Expo

- `tests/deployment/docker-compose.test.ts` explicitly expects `npx expo prebuild` and `EXPO_PUBLIC_API_BASE_URL`.
- `tests/cdn-img-proxy.test.ts` imports a TypeScript helper from `mobile/services/media.ts` and must move to Kotlin coverage.
- README and `docs/{README,architecture,development,deployment,mobile,user-guide,admin-guide,CHANGELOG}.md` contain Expo/APK behavior references.
- `mobile/.gitignore` currently ignores `/android`; native conversion must invert this.
