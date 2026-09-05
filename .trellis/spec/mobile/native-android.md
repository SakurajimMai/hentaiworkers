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
- A `main` push produces a signed artifact for verification but does not publish. A GitHub Release
  requires an explicit `workflow_dispatch` with `publish_release`, all four release-signing
  secrets, and the same pinned certificate. Partial signing configuration must fail.
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
- Do not restore an unconditional startup burst for the home catalog, tags, ads, or `/api/me`. The
  home catalog starts when `HomeScreen` enters composition, tags load on discovery, and `/api/me`
  requires a persisted session cookie. Ads load after useful home content, on demand from player or
  catalog screens that consume ads, and only after the reader's first original image is displayed.
- Invalid API origins and media URLs fail closed or use the documented production fallback.
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
- The reader remains a continuous vertical reader. Use lazy page composition and a proven
  subsampling/zoom library; do not eagerly fetch or decode the entire chapter.
- After manga details settle for 350 ms, prepare the default chapter in the background. Every
  explicit reader navigation, including chapter changes and restored-page entries, calls
  `prepareReader` before navigation. Preparation must not publish reader UI state or record history.
- Chapter preparation is single-flight per normalized manga/chapter key. Cache successful chapter
  responses for 30 seconds with capacity two; do not cache failures, and allow a later attempt to
  retry them.
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
  current-page readiness. In the reading direction, prepare two adjacent memory previews and four
  further disk-only pages; retain one trailing disk candidate for reversal. Exclude all visible
  URLs, deduplicate candidates by URL, update direction from actual page movement, and keep at most
  two speculative jobs. Window size and active concurrency are separate limits. Promoted visible
  transfers bypass speculative capacity, while cancelled speculative jobs retain their slots until
  completion. Discard stale candidates and preview bitmaps when the window or chapter changes.
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
   formally signed `main` build.
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
- Workflow changes: parse YAML in root tests and assert checks, identity validation, signing
  mode, release gate, and absence of the JavaScript runtime.
- Final task validation: root quality commands, `git diff --check`, remote Android workflow,
  then a focused real-device smoke test before production distribution.
