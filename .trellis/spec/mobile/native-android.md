# Native Android Client

## 1. Scope / Trigger

Apply this contract to `mobile/**` and `.github/workflows/build-android.yml`.

`mobile/android/` is an independent Kotlin + Jetpack Compose client. It consumes the
existing HTTP API and must remain outside the root Next.js dependencies, TypeScript/ESLint
scope, Docker image, production Compose services, and server-private imports.

## 2. Stable Identity And Upgrade Contract

- Application id: `de.ixacg.animestream`.
- Deep-link scheme: `animestream`.
- Minimum supported SDK: 24 unless a separately approved product change raises it.
- Production signing secrets must live in the branch-restricted `Production` environment, never
  as repository-wide secrets. Ordinary branch builds use a secret-free `CI` environment.
- Production APKs must match the pinned `ANDROID_RELEASE_CERT_SHA256` repository variable. An
  ephemeral debug key is only valid for an explicitly marked internal Actions artifact.
- Builds 39 and earlier used the public Expo template debug certificate. It must not be reused as
  the production key; users must uninstall those builds before installing the first securely
  signed native release.
- Every `main` build that passes verification with all four release-signing secrets and the pinned
  certificate publishes a full `build-N` release automatically with `make_latest: true` and never
  as a prerelease (push or `workflow_dispatch`; a manual run may untick `publish_release` for a
  verification-only build). Branch and PR builds never
  publish. After publishing, the release job keeps only the newest eight `build-N` releases and
  deletes older releases together with their tags. Partial signing configuration must fail.
- The first native launch must idempotently import the five known `RKStorage` values without
  deleting the old database or overwriting newer native rows.
- Launcher branding uses the AnimeStream paper/ink/ember mark. Adaptive icons keep the solid
  background and transparent VectorDrawable foreground as separate layers; do not flatten a
  rounded square into the foreground. Keep legacy square/round density WebP files, an Android 13
  monochrome layer, and a dedicated splash vector derived from the same master geometry.

## 3. Runtime Contracts

- Retrofit/OkHttp DTOs follow the existing public API; do not change server responses for the
  client rewrite.
- Configure explicit, bounded API connect/read/write/call timeouts that tolerate mobile-network
  latency; do not fall back to OkHttp's 10-second defaults or expose raw transport exception text
  to users. A failed refresh must preserve already-rendered home content.
- Home catalog sections publish in completion order. The first non-empty section must replace the
  full-screen spinner while the other request continues; a later partial failure keeps content and
  exposes inline retry, while only a no-content failure may use the full-screen error state.
- Catalog controls remain visible for initial loading, errors, and successful empty responses.
  Empty filtered results provide a clear-filter action. Refresh and pagination use separate jobs,
  propagate cancellation, and reject responses from an older filter generation.
- Keep a single `NavHost` in a stable composition slot. Show or hide the bottom bar and
  navigation rail without wrapping the host in exclusive layout branches; otherwise catalog
  scroll state is discarded when opening a title and pressing back. Home, catalog, and library
  lazy lists must use saveable list/grid state so returning from a detail, player, or reader
  destination restores the previous scroll position.
- Do not restore an unconditional startup burst for the home catalog, tags, ads, or `/api/me`. The
  home catalog starts when `HomeScreen` enters composition, tags load on discovery, and `/api/me`
  requires a persisted session cookie. Ads load after useful home content, on demand from player or
  catalog screens that consume ads, and only after the reader's first original image is displayed.
- The site origin and release repository are injected at build time (`ANIMESTREAM_API_BASE_URL`,
  `ANIMESTREAM_UPDATE_REPOSITORY`) and never written into source. Gradle rejects a missing or
  malformed origin; a blank repository disables update checks. Invalid runtime media URLs still
  fail closed.
- The proxied image scope is never configured: every image whose host is under the API origin's
  domain (`www.example.com` -> `*.example.com`, minus the site host itself) is rewritten to
  `/cdn-img/<host>/<path>`; other hosts load directly. The rule mirrors `lib/server/image-proxy.ts`
  exactly (including the two-label public-suffix guard) and the two test suites share examples.
- `/cdn-img` stays the primary image path because some networks cannot reach the image host, but
  the proxy can itself be down. A 5xx answer for a proxied image retries the host named in the path
  exactly once, keeping the proxied disk cache key so the next request for that page is served from
  disk; 4xx answers, transport failures and non-proxied addresses are never retried.
- API JSON and image traffic may share an OkHttp connection pool and dispatcher to reuse transport
  resources, but derive both clients from the same neutral base client so their TLS configuration is
  connection-compatible. Merely injecting one pool into independently built TLS clients does not
  guarantee reuse. The image client must not inherit the API cookie jar or send the authenticated
  website session to media hosts.
- Logged-out library data uses Room; the target-site session and migration version use
  DataStore; login performs best-effort local-to-cloud merging.
- OkHttp cookie callbacks update memory immediately and serialize DataStore writes. A
  successful login must await its session-cookie write before exposing logged-in state so an
  immediate process restart cannot lose the session.
- Media3 owns MP4/HLS playback. Main playback waits until the pre-roll decision is ready, and
  lifecycle pauses must neither display pause ads nor resume a user-paused video.
- The player chrome is Compose, not Media3's `PlayerView` controller (`useController = false`), and
  its deterministic parts live in `PlayerUiPolicy` with JVM tests: seek clamping, time formatting,
  double-tap thirds, drag-axis routing, the bounded scrub window, level adjustment, speed and fit
  cycles, auto-hide, progress throttling, completion and resume. Chrome and overlays consume
  `safeDrawing` insets; the video surface stays edge to edge. Gestures and controls must be inert
  while a pre-roll or pause ad is on screen, and while the screen is locked only the unlock control
  responds. Screen brightness is a per-screen override that must be released on disposal.
- Playback reports the real position: throttled while playing plus once on pause and on disposal,
  with completion at 95%. Never write a synthetic one-second marker, because the site's history and
  continue-watching rows read these values. Resume applies a cloud position only while playback is
  still at the start, so a late lookup cannot move a viewer who already seeked.
- The reader remains a continuous vertical reader. Use lazy page composition and a proven
  subsampling/zoom library; do not eagerly fetch or decode the entire chapter.
- Pinch changes the chapter canvas reading scale (1x-4x) while reader chrome remains fixed.
  Use Compose gesture calculations and claim multi-pointer transforms in the Initial pointer pass;
  single-finger vertical input must retain lazy-list/long-page fling and nested-scroll behavior.
  Anchor zoom by stable item key and within-page fraction, including when a top ad is inserted.
- Bound the original request's Coil transition bitmap to 960x2560 with FIT/exact precision; Telephoto
  still reads the full-resolution disk file for subsampling. Preserve cached/saved image dimensions
  when lazily re-entering a page. A prepared preview overlay must not own independent zoom gestures.
- Classify finite long-page viewports from base reader width and maximum reading scale so a pinch
  cannot switch layout modes midway. Top-ad insertion relies on stable lazy-list keys; never force
  a scroll to the page start and discard the user's within-page offset.
- After manga details settle for 350 ms, prepare the default chapter in the background. Every
  explicit reader navigation, including chapter changes and restored-page entries, calls
  `prepareReader` before navigation. Preparation must not publish reader UI state or record history.
- Chapter preparation is single-flight per normalized manga/chapter key. Cache successful chapter
  responses for five minutes with capacity three (current, next, previous); do not cache failures,
  and allow a later attempt to retry them.
- Near the end of a chapter (last three pages) with a next chapter available, warm that chapter's
  JSON through the preparation store and its first page as a disk-only transfer outside the
  speculative window. This must not go through `prepareReader` (it would bump the preparation
  revision and stop the active window), must not publish reader state, and is cancelled with the
  reader. A later `warm()` of the same URL joins the running transfer instead of restarting it.
- Treat the successful chapter response as the reader's only critical bootstrap result. Publish
  its pages immediately; full manga details, favorite state, history, ads, and other optional work
  may merge later but must neither block nor erase already published pages. Guard late results by
  the active reader generation and chapter key.
- Preparation warms only the bounded target page as a `480x1280` memory preview. Use a deterministic
  preview memory key and the original image URL as its disk-cache key; the reader still requests the
  original image and uses an available preview only as its placeholder, so preparation cannot reduce
  final image quality. Preview requests use `Scale.FIT` and exact precision to constrain both image
  dimensions, including unusually tall images. A visible original request must start immediately;
  never set it to null while a prepared preview is loading or decoding.
- Initialize reader list state at the bounded restored page instead of composing page zero and
  seeking afterward. Start the moving prefetch window when pages are published, independently of
  current-page readiness. Page fetches are latency-bound (cold edge fetches spend 1-2 s before the
  first byte), so in the reading direction prepare three adjacent memory previews and seven further
  disk-only pages; retain one trailing disk candidate for reversal. Exclude all visible URLs,
  deduplicate candidates by URL, update direction from actual page movement, and keep at most four
  speculative jobs. Window size and active concurrency are separate limits. Promoted visible
  transfers bypass speculative capacity, while cancelled speculative jobs retain their slots until
  completion. Discard stale candidates and preview bitmaps when the window or chapter changes. The
  shared OkHttp dispatcher allows eight calls per host so visible originals and catalog JSON never
  queue behind the speculative budget.
- Give the first target a bounded 300 ms head start before speculative work. Skip this one-time
  delay when the target original or preview is already in memory, release it early on target
  preparation success/failure, and release it immediately when the active page changes. The timer
  must never delay visible originals, re-arm on ordinary window updates, depend indefinitely on
  image readiness, consume a speculative slot, or survive reader disposal/chapter replacement.
- All reader preview, disk-only, and original requests use the shared Coil loader, the original URL
  disk key, and the reader request marker. The shared reader fetcher locks each URL through Coil's
  HTTP fetch/disk commit, then releases it before decode so visible requests can reuse the committed
  file without waiting for preview decoding. Preserve this factory when cloning the loader for
  Telephoto. Coil 2.7 disk-only requests use a request-specific decoder that returns a non-bitmap
  result without image decoding; memory caching is disabled, and a missing committed disk snapshot
  is an error. Never register that decoder globally or decode a tiny bitmap just to warm disk.
- Success, failure, cancellation, and disposal must release prefetch work. Failures do not retry in
  a tight loop; re-entering the window or explicit page retry can retry them. Leaving the reader
  invalidates its generation and cancels outstanding reader/preparation jobs so late bootstrap
  completion cannot restart prefetch. Preparation completion must not replace an active window.
- Only Telephoto's original `isImageDisplayed` signal for an actually visible page can latch reader
  readiness and unlock ads, including already-cached ad HTML. A prepared preview or a precomposed
  offscreen page must never unlock reader ads. Preserve the original-image frame wait and retry UI.
- An image whose scaled height can exceed practical Compose item constraints must use a finite
  subsampling viewport with base-scale vertical pan and nested-scroll handoff. Do not squash the
  image, clip away unreachable content, or request an intrinsic million-pixel layout height.
- Reader progress uses stable page keys, a visible-page fallback for unusually tall pages,
  and the established debounce before persistence.
- APK chapter rows display only the normalized chapter number. Reader chrome consumes
  `safeDrawing` top/bottom plus horizontal insets while the manga canvas remains edge-to-edge.
  Slider changes map to a bounded discrete page and cancel the previous seek immediately during
  dragging; releasing the thumb commits the final page again.
- Native registration remains a validated external-browser handoff to the site's `/register` page.
  Registration availability, email allowlists, rate limits, Turnstile, and optional email
  verification remain server/Web-owned; do not add a client shortcut that bypasses them or import
  the browser session into the APK. Browser-launch failure must remain an inline recoverable error,
  and the user returns to the APK login screen after registration.
- Update checks run independently after home catalog loading finishes and never mutate home state.
  Successful automatic checks are limited to once per 24 hours, failures back off for 6 hours,
  manual checks bypass both windows, and dismissing one version snoozes it for 24 hours. The client
  validates the fixed package, `build-N` tag, GitHub URLs, names, sizes, SHA-256 values, and all five
  ABI assets before selecting the first device ABI or falling back to universal. Browser download
  and the Android package installer remain user-confirmed; no silent-install permission is allowed.
  Finding an available update is not persisted as a successful check until the user dismisses or
  opens it, so process death before presentation cannot suppress the reminder. DataStore failures
  remain inside the update subsystem and must never escape into `viewModelScope`.

- Feed ads consume the same resolved `width`/`height` as the web. A sized `card` is letterboxed
  inside the 2:3 poster cell (contain, centred, never cropped); all feed ads occupy one cell
  and legacy placement fields are ignored. Automatic sizing keeps the fluid/measured paths; an empty slot shows a
  poster-sized placeholder. Fixed creatives measure the WebView at native CSS pixels through an
  explicit layout modifier that reports the scaled footprint; `requiredSize` + `graphicsLayer`
  centres the oversized view before scaling and shifts narrow banners out of their box.

## 4. Build And Verification Boundary

Developers edit Android code locally but do not run `gradlew`, Android Studio builds,
emulators, device tests, or any local Android compilation. GitHub Actions is the authoritative
Android build environment and must:

- When the combined quality step stops at `ktlintCheck`, treat downstream Android lint, JVM tests,
  and APK assembly as unverified. Use the uploaded `ci-gradle.log` and `ktlint-format.patch` as the
  source of truth, apply the formatting patch, and require a new remote run before distribution.

1. Validate the committed Gradle wrapper and install Java 17 plus the Android SDK.
2. Run Kotlin formatting, Android Lint, JVM/Robolectric tests, `assembleDebugAndroidTest`,
   and `assembleRelease`. Device-test APK compilation does not count as device-test execution.
3. Verify APK package, versionCode, launcher activity, archive integrity, and signature.
4. Reject React Native, Hermes, Metro, Expo, or JavaScript bundle remnants.
5. Build and validate real `arm64-v8a`, `armeabi-v7a`, `x86_64`, and `x86` splits plus a
   universal APK. Every split must contain only its target ABI and match the corresponding native
   libraries in the universal APK.
6. Upload all five APKs and diagnostic reports; publish them to GitHub Releases only from a
   formally signed `main` build, then prune releases beyond the newest eight.
7. Inspect every assembled APK resource table for the launcher foreground, monochrome mark,
   splash icon, and normal/round launcher entries.

Release-signing values validated by the configure step must also be scoped to the Gradle build
step; exporting only the keystore path silently falls back to debug signing. Room schemas use the
official Room Gradle plugin and are checked in. Do not point concurrent kapt variants at one raw
`room.schemaLocation`, because they can truncate each other's JSON output.

## 5. Tests Required

- API/model changes: MockWebServer contract coverage for paths, queries, JSON, and cookies.
- Local persistence changes: parser and Robolectric migration tests, including corrupt rows,
  idempotency, old-database retention, and newer-native-data precedence.
- Session tests must cover a login followed by a fresh cookie-store instance and wait on the
  production persistence boundary instead of scheduler-idle heuristics.
- Reader/player/ads changes: extract deterministic policy into pure unit tests; validate real
  media and gestures with the remote APK on a device.
- Reader scheduling changes additionally need real Coil + MockWebServer delayed-response tests for
  bounded concurrency, readiness-independent prefetch, visible promotion without duplicate network
  transfers, cold/warm caches, disk-only decode avoidance, tall previews, reversal, jumps, failures,
  cancellation, and chapter disposal. Record network, disk/memory source, actual bitmap decode, and
  display timing separately. Compose/Telephoto instrumented coverage must use original display
  callbacks; JVM decoder completion is not proof that pixels were displayed on a device.
- Catalog state changes must cover successful empty results and stale-generation suppression.
  Update policy tests must cover timing windows, snoozing, ABI fallback, strict manifest rejection,
  and the exact Retrofit endpoint; automatic failure must remain outside home state.
- Navigation chrome policy tests must cover phone/tablet catalog chrome, manga-detail not matching
  the manga tab, and detail/reader/player hiding chrome without requiring a different NavHost slot.
- Workflow changes: parse YAML in root tests and assert checks, identity validation, signing
  mode, release gate, and absence of the JavaScript runtime.
- Final task validation: root quality commands, `git diff --check`, remote Android workflow,
  then a focused real-device smoke test before production distribution.
