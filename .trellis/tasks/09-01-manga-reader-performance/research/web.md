# Web reader audit

## Confirmed stack

- Next.js 15.5 App Router, React 19, Server Components + client `MangaReader`.
- Native `<img>` through `MediaImage`; no `next/image` reader pipeline.
- Drizzle/mysql2 to remote MySQL/MariaDB.
- Web images load directly from external URLs such as `image.ixacg.de`.

## Confirmed findings

- `(site)` layout waits for user/settings/header even though CSS later hides header/footer on reader pages.
- Reader page waits for current user, favorite, ads and `recordMangaView` after chapter pages are known.
- `getManga` and `getChapter` duplicate manga lookup; `getChapter` loads full chapter list through `getMangaBySlug`; metadata performs another lookup.
- A single `rootMargin: 1400px` observer both preloads and selects active page.
- Production chapter 584, 292 pages, 390x844, no scrolling: `scrollY=0`, UI becomes P6/P292, local progress index becomes 5.
- Initial set is `[0,1]`; both images are eager without explicit high fetch priority. Hydration observer can expand to 4-6 requests.
- Restoring index 200 starts P1/P2 around 281/282ms, target P201 at 1101ms.
- Fixed 900x1280/2:3 placeholders disagree with production samples from landscape/square to tall portrait.
- Single-page errors are isolated; decoding is async; observers/listeners clean up; no whole-chapter image Promise gate or duplicate same-URL browser download was found.

## Production baseline

Chrome Headless, 390x844@3x, 4x CPU, 150ms RTT, 1.6Mbps down, cold cache. Readable = download complete + `decode()` + 2 RAF.

| Scenario | Request start | Download end | Readable | LCP |
|---|---:|---:|---:|---:|
| Chapter 585 P1, 280 pages | 332ms | 2801ms | 2873ms | 2824ms |
| Restore P201 | 1101ms | 3234ms | 3293ms | not used |

P1 LCP element was confirmed as `img.reader-image`.

## Unconfirmed

- Long-chapter DOM/memory is a theoretical risk, but no phone/browser memory trace proves it is the current TTIR bottleneck.
- Current production reader ads were empty, so ad network competition was not observed even though server ad configuration still blocks HTML.
