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
- Feed slots have `placement: card | banner`. Cards fill one poster cell at 2:3 and load a fluid
  ad document (`fluid=1`) so native/responsive snippets match the catalog grid. Banners occupy two
  poster columns (`col-span-2`) and keep a fixed creative viewport. Empty native cards stay
  poster-sized. Stored HTML slots without placement migrate to banner.
- Homepage rails interleave `card` slots next to catalog posters. The dedicated home strip is
  banners only — never drop cards from home because they are not banners. `/browse` and `/manga`
  keep both placements in the poster grid. `interleaveFeedAds` include filters must preserve the
  public `feedSlots` index used by `/ads/html/feed/{id}`. Banner `col-span-2` must appear as a
  complete class in `components/` or `app/` (Tailwind does not scan `lib/`).
- Size feed cards like catalog posters (`poster-frame` + `aspect-[2/3]` + Radix `AspectRatio`).
  Give fill iframes explicit pixel width/height from ResizeObserver; mobile WebKit treats
  `iframe { height:100% }` as 0 inside an absolute box. Fluid/fill documents must not apply
  `transform: scale(...)` — a 0 `innerWidth` before layout becomes `scale(0)` and the creative
  never recovers. Scale fixed creatives with ResizeObserver, not `100cqw`.
- Banner creative dimensions are optional additions to the public API. Existing settings use automatic
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
