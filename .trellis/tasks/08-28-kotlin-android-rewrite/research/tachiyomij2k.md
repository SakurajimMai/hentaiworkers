# TachiyomiJ2K Reader Research

## Reference And Version

- Repository: https://github.com/Jays2Kings/tachiyomiJ2K
- Inspected commit: `8df100d6e616851e329b274964c726dcef0556b6` (2026-08-28)
- License: Apache License 2.0
- README: https://github.com/Jays2Kings/tachiyomiJ2K/blob/8df100d6e616851e329b274964c726dcef0556b6/README.md
- Reader tree: https://github.com/Jays2Kings/tachiyomiJ2K/tree/8df100d6e616851e329b274964c726dcef0556b6/app/src/main/java/eu/kanade/tachiyomi/ui/reader

The requested reference is actively Kotlin-based but its reader is not a simple Compose screen. It separates activity/view model, chapter loaders, reader page state, navigation regions, progress control, paged viewers and webtoon viewers. The current AnimeStream scope only needs the continuous vertical/webtoon subset.

## Relevant Patterns

### Full-screen reader state

J2K keeps reader chrome separate from page rendering. A center/menu navigation region toggles chrome; meaningful vertical scroll hides it. This maps well to AnimeStream's existing tap-to-toggle behavior and should replace ad hoc touch timing with explicit reader state.

Source:
https://github.com/Jays2Kings/tachiyomiJ2K/blob/8df100d6e616851e329b274964c726dcef0556b6/app/src/main/java/eu/kanade/tachiyomi/ui/reader/viewer/webtoon/WebtoonViewer.kt

### Virtualized continuous strip

`WebtoonViewer` uses RecyclerView, a dedicated layout manager and stable adapter items rather than decoding a whole chapter. It identifies the active item from visible layout state and begins preloading near the final five pages. The Compose equivalent should use LazyColumn, stable keys, bounded prefetch and page-local state.

### Page-local load and error handling

`WebtoonPageHolder` observes queued/loading/downloading/ready/error states, displays progress, retries an individual page and recycles image resources. It fits pages to width and uses a subsampling image view for high-resolution zoom.

Source:
https://github.com/Jays2Kings/tachiyomiJ2K/blob/8df100d6e616851e329b274964c726dcef0556b6/app/src/main/java/eu/kanade/tachiyomi/ui/reader/viewer/webtoon/WebtoonPageHolder.kt

### Progress and system gestures

`ReaderSlider` treats the progress control as a real navigation element and excludes its bounds from Android system gestures on supported versions. AnimeStream should similarly keep the slider above the navigation inset and ensure back gestures do not steal a page seek.

Source:
https://github.com/Jays2Kings/tachiyomiJ2K/blob/8df100d6e616851e329b274964c726dcef0556b6/app/src/main/java/eu/kanade/tachiyomi/ui/reader/ReaderSlider.kt

### Reading modes deliberately out of scope

J2K supports left-to-right, right-to-left, paged vertical, webtoon and continuous vertical modes. AnimeStream currently exposes only continuous vertical reading, so adding these modes would violate the parity-focused scope and add unnecessary state.

Source:
https://github.com/Jays2Kings/tachiyomiJ2K/blob/8df100d6e616851e329b274964c726dcef0556b6/app/src/main/java/eu/kanade/tachiyomi/ui/reader/settings/ReadingModeType.kt

## What We Will Reuse Conceptually

- Black, distraction-free full viewport reader surface.
- Independent reader chrome and content states.
- Tap navigation region for menu; scroll and zoom hide chrome.
- Stable virtualized page items and bounded preloading.
- Page-specific loading, failure and retry.
- High-resolution-friendly subsampling zoom.
- Current page progress, chapter sheet and explicit chapter transitions.

## What We Will Not Bring In

- Extension/source engine, downloads, archives, EPUB/RAR/ZIP loaders.
- Multiple reading directions/modes, tracking providers, categories, backups or update service.
- Gamepad and keyboard reader controls beyond standard Android accessibility focus.
- J2K's presenter/RxJava/Conductor/database architecture.
- Direct wholesale source copying.

If a small Apache-2.0 implementation fragment is later adapted rather than independently reimplemented, its source file and copyright notice must be recorded in the app's third-party notices. The current design intends behavioral reference only.

## Compose Image Candidate

Telephoto provides Compose-native pan/zoom and automatic subsampling for large images and uses Apache-2.0:

- https://github.com/saket/telephoto
- https://github.com/saket/telephoto/releases

It is a candidate, not an unconditional dependency. The first reader prototype must prove nested vertical scrolling, zoom reset/recovery, Referer-aware network loading and long-image memory behavior. The fallback is an AndroidView-based RecyclerView/subsampling presentation behind the same reader state contract.

## UI Skill Findings

The generated product-wide design-system suggestions were rejected because both results described web landing pages and conflicted with the existing editorial application direction. Verified guidance retained from `ui-ux-pro-max`:

- Compose virtualized lists with stable keys.
- Decouple navigation events from replayable screen state.
- Android touch targets at least 48dp with spacing.
- Respect safe areas and prevent full-screen gesture handlers from breaking system back.
- Test small phone, tablet/landscape, large text, TalkBack and reduced motion.
