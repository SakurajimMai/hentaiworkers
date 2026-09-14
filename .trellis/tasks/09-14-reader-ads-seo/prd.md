# APK 阅读预取、信息流广告尺寸与 SEO 收录优化

## Goal

Cut the per-page wait in the Android manga reader, make feed ads render at the configured creative
size on web and Android, and make the site easier for Google and Bing/Edge to index.

## Findings

- Cold page images from `image.ixacg.de` take ~1.4 s to first byte (Cloudflare MISS) and ~2.3 s
  total for a 480 KB 1280×2240 JPEG; latency, not bandwidth, dominates. The APK only kept two
  speculative transfers in flight with a six-page window, so fast readers outran the prefetch.
- `/cdn-img` stays as the APK image path (direct Cloudflare image host fails for some users).
- Android rendered sized feed cards with `fill` (cropped) and positioned fixed creatives with
  `requiredSize` + `graphicsLayer`, which centres the oversized WebView before scaling.
- `/sitemap.xml` was a single 4,480-URL file that throws at 50k; `/manga` pagination canonicalised
  to page 1; `/browse?tag=ID` pages had no resolved tag name; pagination used buttons; no IndexNow.

## Requirements

- Reader: 4 concurrent speculative transfers, 3 previews + 7 disk pages ahead, 5-minute chapter
  preparation cache (capacity 3), next-chapter JSON + first-page warmup near chapter end, OkHttp
  8 calls per host. Pipeline tests updated; APK verification is GitHub Actions only.
- Feed ads: infer `<img width height>`; sized cards letterbox (contain) on web and Android; Android
  banners scale to the spanned columns; empty slots show a placeholder; docs tell operators to enter
  the creative's real pixel size.
- SEO: sitemap index + chunked sections with cover images, IndexNow key + automatic pings,
  curated-tag indexing rules, resolved browse tag names, breadcrumbs, OG site name/locale, adult
  rating meta, image host preconnect, crawlable pagination, robots additions.

## Acceptance Criteria

- [x] `npm run lint`, `typecheck`, `test`, `check:legacy`, `check:boundaries`, `build` pass.
- [x] `npm run test:ads:browser` passes including sized-card contain assertions.
- [ ] Android workflow passes on push (ktlint, lint, JVM tests, assemble).
- [ ] Real-device smoke: chapter open, fast scroll, next-chapter transition, sized feed card.
