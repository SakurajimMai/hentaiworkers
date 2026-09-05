# Reader Prefetch Change And Verification

## Browser Result

The visible page is admitted immediately, independent of the initial image's download or
decode. A direction-aware window prepares four pages ahead and one behind after movement;
initial restoration prepares only a small neighborhood. Up to two pending speculative
requests are admitted. Actual visible pages bypass occupied speculative slots, so this is
not a global two-connection limit. Previously admitted image elements stay mounted and
reuse their original URLs. Success, failure, and explicit retry update request accounting
separately from admission. Ads retain the initial target's settlement/decode/paint gate.

The first speculative window now gets a maximum 300 ms startup grace, ending earlier when
the initial transfer succeeds or fails. Visible pages bypass this grace. A controlled
283,612-byte image benchmark caught a 30.6% first-readable regression with immediate
speculative requests despite low fetch priority; the bounded grace was added in response.
This does not depend on preview decode, image paint, or the ad gate.

The first browser run caught speculative requests for pages 1 and 2 before restoring to
page 35. Neighbor admission now waits for the layout restoration step. A server-rendered
initial page 0 can still begin before localStorage is available; no initial neighbors do.
Window positions and stored-page validation use actual page IDs, including gaps left by
admin deletion, rather than treating array length as the maximum page ID.

`npm run test:reader:browser` passed all 15 scenarios on the final browser implementation:

- Desktop and mobile: delayed initial image with bounded prefetch and ad gating.
- Desktop and mobile: next-page requests before viewport entry and updated priority.
- Desktop and mobile: immediate distant visible page while old requests are pending.
- Middle restoration, reverse scrolling, progress, favorite toggle, and theme toggle.
- Sparse page IDs, deleted restore targets, and restoration to a valid last sparse ID.
- A distant visible page requesting before the 300 ms speculative grace expires.
- Image failure, capacity release, same-URL retry, and local-only guest progress.
- Chapter replacement and unmount without old completion draining queued work.
- Long-page geometry, reverse reading, and browser cache reuse.
- Five cold runs each of the original and modified reader for both small and textured images.

Desktop and mobile delayed-opening cases requested only pages 0, 1, and 2, with peak
three active image requests. Fast jumps requested the distant visible page(s) without
requesting intervening chapter pages. Dynamic high priority remained limited to the active
page. For the 19,486-byte image, first-readable medians were 1137.7 ms before and 1168.5 ms
after (+30.8 ms); request-to-readable medians were 231.4 ms and 234.2 ms. For the textured
283,612-byte image, first-readable medians were 1316.4 ms and 1336.3 ms (+19.9 ms, 1.5%);
request-to-readable medians were 416.7 ms and 411.5 ms. Each comparison used five cold runs
per version. Baseline commit: `db018ad9a1b8a4939fd707b94d5deb04b8c30b9b`.
Conditions: 1280 x 800 viewport, 2x CPU slowdown, 80 ms emulated latency, 1,500,000 bytes/s
download, 180 ms image-service delay, synthetic 900 x 1280 PNGs. This demonstrates no
clear regression in this harness; it is not a physical-device or production-CDN benchmark.

Artifacts from the passing run:

- `/tmp/reader-browser-OOxtJL/results.json`: requests, responses, priorities, cache events,
  decode timings, visibility, decode-plus-two-frame readability, and scenario results.
- `/tmp/reader-browser-OOxtJL/first-image-comparison.json`: ten small-image cold samples.
- `/tmp/reader-browser-OOxtJL/first-image-textured-comparison.json`: ten textured-image cold samples.
- `/tmp/reader-browser-OOxtJL/desktop-reader.png` and `mobile-reader.png`: screenshots.

The harness uses real reader components and production CSS. Next navigation and the
favorite server action are boundary stubs; progress uses a controlled HTTP endpoint.
Full Next SSR, live authentication/database integration, production CDN behavior, and
Safari/Firefox were not browser-tested.

## Android Result

The current original request no longer waits for preview readiness. The moving window
prepares two adjacent 480 x 1280 maximum previews, four additional forward disk files,
and one trailing disk file, reversing with reading direction. The preloader limits
speculative work to two jobs and retains reservations through cancellation completion.
It also gives cold initial requests a one-time maximum 300 ms speculative grace, bypassed
by cached targets and released by target prewarm settlement or movement to another page.
This is a precaution against first-transfer contention, not a measured APK performance gain.
The shared Coil loader coordinates reader requests by original URL through disk commit,
allowing visible original decode without waiting for preview decode. Disk-only requests
use a request-specific non-bitmap decoder and require a committed cache snapshot.
Telephoto original/subsampling rendering remains in use; ads require an actually visible
original to be displayed. Reader disposal invalidates late bootstrap work and clears the
prefetch window and tracked previews.

Transfer reuse relies on the existing shared disk cache being writable. Failed disk-only
writes are reported as failures, releasing their slots. Physical Android first-display
performance, memory use, and device behavior have not been measured in this task.

Added 15 real Coil/MockWebServer JVM integration tests and five Telephoto device canvas tests,
including precise startup-grace expiry, cache bypass, early completion/failure, and jump release.
None of the Android Gradle, JVM, instrumentation, emulator, device, or APK build checks
were executed: this environment has no Java/SDK/device tools, and the mobile repository
contract uses GitHub Actions for Android builds. Static source/API review and whitespace
validation are not substitutes for those checks. See [Android validation and APK rebuild
steps](research/android-validation.md) for exact commands and remaining device checks.

## Executed Root Checks

- `node --import tsx --test tests/manga-reader-policy.test.ts tests/manga-reader-scheduler.test.ts tests/manga-reader-progress.test.ts`: passed.
- `npm test`: passed all 44 test files, including the existing progress/ads tests.
- `npm run typecheck`: passed, including the browser fixture.
- `npm run check:boundaries`: passed.
- `npm run check:legacy`: passed.
- Targeted ESLint for the four browser component files, two reader test files, and
  `tests/browser`: passed with zero warnings.
- `npm run lint`: failed on the pre-existing `tests/home-carousel.test.ts:108`
  `react/no-children-prop` violation, confirmed present in HEAD.
- `npm run build`: passed again after the restoration, sparse-page, and startup-grace corrections.
- `git diff --check`: passed for all current changes.

## Changed Files

Browser implementation and tests:

- `components/manga-reader.tsx`
- `components/manga-reader-policy.ts`
- `components/manga-reader-scheduler.ts` (new)
- `components/media-image.tsx`
- `tests/manga-reader-policy.test.ts`
- `tests/manga-reader-scheduler.test.ts` (new)
- `tests/browser/manga-reader.mjs` (new)
- `tests/browser/reader-fixture.tsx` (new)
- `package.json`
- `package-lock.json`

Android implementation, tests, and test dependencies:

- `mobile/android/app/src/main/java/de/ixacg/animestream/reader/ReaderLogic.kt`
- `mobile/android/app/src/main/java/de/ixacg/animestream/reader/ReaderScreen.kt`
- `mobile/android/app/src/main/java/de/ixacg/animestream/reader/ReaderPreviewPreloader.kt`
- `mobile/android/app/src/main/java/de/ixacg/animestream/reader/ReaderImageRequests.kt` (new)
- `mobile/android/app/src/main/java/de/ixacg/animestream/ui/AnimeStreamViewModel.kt`
- `mobile/android/app/src/main/java/de/ixacg/animestream/AppContainer.kt`
- `mobile/android/app/src/test/java/de/ixacg/animestream/reader/ReaderLogicTest.kt`
- `mobile/android/app/src/test/java/de/ixacg/animestream/reader/ReaderImagePipelineTest.kt` (new)
- `mobile/android/app/src/androidTest/java/de/ixacg/animestream/reader/ReaderDisplayInstrumentedTest.kt` (new)
- `mobile/android/app/build.gradle.kts`
- `mobile/android/gradle/libs.versions.toml`

Reader contracts and task records:

- `.trellis/spec/frontend/quality-guidelines.md`
- `.trellis/spec/mobile/native-android.md`
- `.trellis/tasks/09-05-reader-prefetch/`: `task.json`, `prd.md`, `design.md`,
  `implement.md`, `implement.jsonl`, `check.jsonl`, this report, and
  `research/android-validation.md`.

Existing SMTP/admin changes and root `design.md` were not modified by this task.
