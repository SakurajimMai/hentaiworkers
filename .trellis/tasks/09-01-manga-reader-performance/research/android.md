# Android reader audit

## Confirmed stack

- Native Kotlin/Jetpack Compose.
- Retrofit/OkHttp for API, Room/DataStore for local state.
- Coil 2.7.0 + Telephoto 0.16.0 in a `LazyColumn`.
- `image.ixacg.de` is rewritten to same-site `/cdn-img`; this is an intentional compatibility path.

## Confirmed findings

- `loadReader` launches chapter, full manga detail and favorite concurrently, but awaits all three before publishing `ReaderContent`.
- Logged-in favorite reads the full favorites endpoint and can be held by the API client's 25s timeout.
- The chapter response already includes manga summary plus complete ordered pages, enough for critical display.
- Existing detail/favorite data is not reused on reader entry or chapter change.
- `LazyListState` starts at item 0, then an effect scrolls to the restored page.
- On content/current-page changes, the reader explicitly enqueues the next four images. Overlapping windows are rescheduled, Disposables are discarded, and prefetch is not canceled on exit.
- `.size(64,64)` only limits decode/cache representation; the proxy still transfers the full original file.
- Coil success occurs before Telephoto `imageState.isImageDisplayed`; current spinner timing is not TTIR.
- Page ratio starts at 0.72 and updates after drawable success because API has no dimensions.
- LazyColumn, stable keys, Telephoto subsampling and per-page retry are sound; no rewrite/extra virtualization is justified.

## Structural baseline

- 40-page sequential reading schedules 150 prefetch enqueue attempts for 39 unique future URLs.
- Initial critical period competes current image with four prefetched originals.
- Proposed scheduler reduces these to at most 39 once-per-URL attempts and zero future-page prefetch before current page is displayed.

## Unconfirmed

- Phone TTIR, decode time, continuous-scroll wait, failure rate and memory need an APK on a real device.
- Sharing API/image OkHttp connection pools might save setup time, but no measurement currently proves it material.
