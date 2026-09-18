# Site Metadata And Ads

- Global verification tags live in `site.metaTags` as validated `name`/`property`, key, and content
  records. Use React attributes in the root server layout so tags are present before JavaScript runs.
- The meta importer uses the browser HTML parser in an inert document and accepts only meta tags.
  Never inject a verification snippet as raw head HTML. Keep viewport/theme attributes app-owned.
- Settings forms distinguish an absent meta field (preserve stored tags) from an explicit empty list
  (remove tags). Invalidate both the metadata cache tag and root layout after saving settings.
- HTML ad creatives run in dedicated documents so script and document.write semantics work. Web
  production frames load same-origin `/ads/html/{feed|reader|player}/…` so `location.protocol` is
  `http:`/`https:` (alliance `atOptions` + `invoke.js` snippets). Keep sandbox without
  `allow-same-origin`. Resize messages must match both the frame window and per-frame identity.
  Redirect `document.body.appendChild` into `#hw-ad-content` so alliance iframes are not
  aborted by later reparenting; still measure height from `#hw-ad-content`, not the iframe viewport.
- Feed slots are poster cards only; no placement field, homepage strip or spanning layout.
  Legacy placement is stripped by schema parsing while creatives and dimensions are preserved.
  Sized cards use contain inside one 2:3 cell; unsized cards use fluid documents.
- Dimension inference (`inferAdDimensionsFromHtml`) reads `atOptions`, then `<iframe>`, `<img>`,
  `<video>` width/height attributes or `style` pixels. Percentages and `data-*` sizes stay automatic.
  The public `/api/ads` already carries resolved sizes, so Android never parses HTML.
- A feed position carries one ad, drawn at random from the enabled slots whose interval lands on
  it, so configured creatives rotate instead of stacking a card each. The draw skips the slot shown
  at the previous position while another candidate exists. Keep `interleaveFeedAds` and
  `AdsRepository.interleave` on the same rule, and take the random draw through the injected `pick`
  so tests stay deterministic. Preserve the public enabled-slot index used by `/ads/html/feed/{id}`.
- A creative that is a single `<img>` (optionally wrapped in a link) is not markup the app needs a
  browser for: Android renders it through its own image loader (`FeedAdCreative.imageUrl` →
  `RemoteImage`), which brings cache, redirects and the `/cdn-img` rewrite, and letterboxes it
  without stored pixel dimensions. Anything that runs code stays in the WebView.
- Size feed cards like catalog posters (`poster-frame` + `aspect-[2/3]` + Radix `AspectRatio`).
  Give fill iframes explicit pixel width/height from ResizeObserver; mobile WebKit treats
  `iframe { height:100% }` as 0 inside an absolute box. Fluid/fill documents must not apply
  `transform: scale(...)` — a 0 `innerWidth` before layout becomes `scale(0)` and the creative
  never recovers. Scale fixed creatives with ResizeObserver, not `100cqw`.
- Creative dimensions are optional additions to the public API. Existing settings use automatic
  layout. When stored width/height are 0, infer CSS pixels from `atOptions` or `<iframe width height>`
  so Adsterra-style 300×250 units still expose that viewport. Fixed-size frames keep the creative's
  CSS pixel viewport and scale the iframe with ResizeObserver; do not shrink `window.innerWidth`
  inside the ad document. GitHub Actions publishing an image is not a production deploy — the live
  host must run the new App image before mobile will show the ads.
- Measure automatic ad height from content, not the root iframe viewport. Cap automatic height and
  support shrinking after a creative changes; stale documents cannot resize their replacements.
- Player HTML frames remain inactive until the pre-roll or pause surface is visible. Clear their
  documents on skip, resume, close, or disposal so hidden scripts and media stop. Preserve configured
  click destinations for HTML content using user-gesture HTTP(S) navigation in the ad document.
- Run `npm run test:ads:browser` and `npm run test:meta:browser` when changing these contracts.
  Inspect screenshots and verify mobile/desktop field geometry as well as HTML assertions.

# Search Engine Indexing

- `/sitemap.xml` is an index; sections are chunked under `/sitemaps/{pages,animes-N,mangas-N,tags-N,
  manga-tags-N}.xml` at most 10,000 URLs each with cover `<image:image>` entries. Keep builders in
  `lib/sitemap.ts` pure and covered by `tests/sitemap.test.ts`; the routes only load the cached
  source and render. `check:legacy` requires both route files.
- Only curated manga tags (`manga.curatedTags`) are indexable `/manga?tag=` pages and sitemap entries;
  other manga tag pages, search pages and reader pages stay `noindex, follow`. Paginated listings
  canonicalise to themselves; `/browse?tag=ID` resolves the tag name server-side and unknown ids are
  `noindex`. Pagination must render real anchors.
- Detail pages use `pageOpenGraph` (site name + locale), `BreadcrumbList`, ISO dates and
  `contentUrl` for videos. The root layout sets `rating: adult`, `max-image-preview: large` and a
  preconnect to the image host.
- IndexNow: key lives in `site.indexNowKey`, served at `/indexnow/{key}.txt`; content mutations call
  `notifyIndexNow` inside `after()` and never throw. Keep `buildIndexNowPayload` same-origin only.

# Configurable Site SEO

- `site.seo` owns title, subtitle, description and comma-separated keywords, validated by
  `siteSeoSchema`. Missing fields retain defaults; partial admin updates preserve stored fields.
- `getSiteSeo` shares the metadata invalidation tag. Root metadata uses title + subtitle for
  homepage, title as child suffix, and matching OG/Twitter defaults. Detail and listing OG uses
  configured site name. Homepage H1 and WebSite use the same settings.
- Legacy custom tags conflicting with SEO, social tags or index rules are filtered on output.
  Verification tags are preserved. Admin copy explains precedence; never inject raw head HTML.
