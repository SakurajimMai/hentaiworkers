# Design

## Problem

HTML ads currently run inside a sandboxed `srcdoc` iframe. The document URL is
`about:srcdoc`, so `location.protocol` is `about:`. Alliance loaders such as
HighRevenueFormat / Adsterra then build `about://…` or `http://…` script/iframe URLs,
which fail on HTTPS pages. Creatives appended to `document.body` also sit outside
`#hw-ad-content`, so auto-height stays ~72px and overflow clips the ad.

Feed HTML is rendered as a portrait grid cell (“信息流原生卡”). A 300×250 banner
cannot lay out there even if the script runs.

## Decisions

- Serve production ad documents from same-origin HTTP(S) routes under `/ads/html/…`
  (feed index, reader top/bottom, player preroll/pause). The iframe `src` is that URL
  plus a `mid` query for resize matching. `window.location` is the site origin, so
  protocol-relative and `location.protocol` snippets work. Keep `sandbox` without
  `allow-same-origin` so scripts cannot read the parent or cookies.
- Keep `buildHtmlAdSrcDoc` as the document body. `HtmlAd` uses `src` when
  `documentSrc` is provided, otherwise `srcdoc` (tests and callers without a slot).
- Player HTML iframes load `/ads/html/player/{preroll|pause}` instead of inlining
  srcdoc; start/stop still toggles `src` so hidden player ads do not run.
- Runtime: reparent non-script body orphans into `#hw-ad-content` and measure body
  scroll height so `document.body.appendChild` creatives size correctly.
- Android `loadDataWithBaseURL` must pass a real `https://{origin}/ads/html` history
  URL so `location.protocol` is `https:` inside the WebView.
- Additive `placement: 'card' | 'banner'` on feed slots. Migrate stored slots: non-empty
  HTML → `banner`, otherwise `card`. Web grid: banners `col-span-full`. Android grid:
  banners `maxLineSpan`, cards one cell.

## Compatibility

- No database migration; JSON settings only.
- `/api/ads` adds optional `placement`. Old Android clients ignore it (`ignoreUnknownKeys`).
- Empty HTML feed cards keep current poster-card look.

## Validation

- Unit tests for slot paths, migration, form parse, player iframe src.
- Browser tests: protocol-relative invoke mock over `/ads/html`-style HTTP URL;
  body-appended iframe; existing parser/async write tests; feed banner geometry.
- Android: unit tests for placement decode and grid-span helper. No local Gradle.
