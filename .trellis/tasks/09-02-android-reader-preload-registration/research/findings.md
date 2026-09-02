# Research findings

## Repository evidence

- `ReaderScreen.kt` starts `loadReader()` only after destination composition and creates the target Coil request only after chapter pages are published.
- `ReaderLogic.prefetchPages()` returns no candidates until the current page is in `displayedPages`; its tests explicitly lock that behavior.
- `MangaDetailScreen` chapter actions and `AnimeStreamApp.reader()` only navigate, so no earlier chapter/image work exists.
- `AnimeStreamViewModel.init` always calls `refreshHome()` and `ReaderScreen` immediately calls `ensureAdsLoaded()`, creating avoidable cold-deep-link competition.
- `ApiClient` and `AppContainer.imageLoader` each create an independent OkHttp client and pool, although Android rewrites proxied manga images to the API origin.
- Website registration is implemented by `actionPublicRegister()` and `SystemSettingsService.registerPublic()`. It enforces open/whitelist/Turnstile/rate/email-verification policy. Android has login/logout/me only and no registration JSON contract.

## Library evidence

- Coil documents that a targetless `ImageRequest` preloads into disk and memory caches: https://coil-kt.github.io/coil/faq/#how-do-i-preload-an-image
- Telephoto recommends a lower-resolution memory-cache placeholder while full quality loads and keeps `isImageDisplayed` false for placeholders: https://saket.github.io/telephoto/zoomableimage/#placeholders
- Telephoto 0.16 source exposes both `isPlaceholderDisplayed` and `isImageDisplayed`, so preview and full readiness can remain distinct: https://github.com/saket/telephoto/blob/0.16.0/zoomable-image/core/src/main/kotlin/me/saket/telephoto/zoomable/ZoomableImageState.kt

## UX guidance applied

The `ui-ux-pro-max` targeted searches returned these applicable rules:

- Loading feedback should preserve layout and explain a real wait rather than leave a frozen surface.
- Lazy-load below-fold images rather than eagerly decode the full chapter.
- Registration needs visible labels, submit/launch feedback, inline recovery, and controls large enough for touch.
- Jetpack Compose UI should expose immutable state, retain a single source of truth, and keep composables stateless where practical.

## Confirmed versus unconfirmed

Confirmed: late target scheduling, full-display-only continuation gate, unconditional home/ads competition, independent connection pools, and absence of a secure native registration endpoint.

Unconfirmed without a physical-device trace: how much of the reported multi-second wait is radio/TLS, proxy/CDN transfer, Coil decode, or Telephoto first display on the user's device.

## Repeat-fix retrospective

The previous `perf(android): 渐进加载漫画阅读页` change correctly removed manga detail and
favorite requests from the critical chapter gate, initialized the list at the restored page, and
bounded continuation prefetch. It did not start chapter or target-image work before reader
composition, however, and it intentionally required the current original image to be fully
displayed before any following request. As a result, its progressive behavior started only after
the exact wait reported by users and could not improve cold target-image time.

This task prevents that regression at the contract level: explicit reading intent prepares the
chapter and target page, matching destination loads adopt the same single-flight result, preview
and full-image readiness remain separate signals, and cold reader entry does not launch optional
home or ad work first. A cached placeholder must also be observable by a request that starts while
preparation is still running; merely writing the placeholder cache later is insufficient because
Coil resolves `placeholderMemoryCacheKey` when the display request starts.

The connection-pool change has a similar non-obvious constraint: OkHttp only reuses a pooled HTTPS
connection when the complete address configuration, including TLS socket factory and verifier
identity, is compatible. The API and image clients therefore derive from one neutral base client
and add their cookie/header behavior afterward. Sharing only a `ConnectionPool` between separately
built clients is not sufficient evidence that TLS connections are reusable.

## Verification results

- `git diff --check`: passed.
- `npm run typecheck`: passed.
- `npm run test`: passed, 247 tests.
- `npm run check:boundaries`: passed.
- `npm run check:legacy`: passed.
- `npm run build`: passed with the production Next.js route build.
- `npm run lint`: blocked by the pre-existing, task-unrelated
  `tests/home-carousel.test.ts:108` `react/no-children-prop` error; this task does not modify that
  file.
- The fixed Coil 2.7 and Telephoto 0.16 APIs used by the implementation were checked against their
  official documentation/source. Local Gradle, Android lint/tests, APK assembly, emulator/device
  screenshots, and physical-device target-image-readable timing were intentionally not run under
  the repository's native Android verification policy.

The earlier production read-only sample (manga 585, chapter 1) measured about 127 ms for the
24,654-byte chapter response and about 130 ms for its 130,911-byte first proxied image from the
server environment. Those values show that the sampled server path was not consistently slow, but
they are not an Android before/after measurement and are not presented as target-image-readable
time. The remaining radio, TLS, transfer, decode, and Telephoto display contributions require a
physical-device trace after the remote build passes.

## Remote CI follow-up

Android run `33617519073` (`Build Android APK #80`) stopped in
`:app:ktlintMainSourceSetCheck` before Android lint, JVM tests, or APK assembly completed. The
uploaded `ci-gradle.log` and `ktlint-format.patch` identify five auto-fixable formatting violations
in `ReaderPreviewPreloader.kt`, `ReaderScreen.kt`, `AnimeStreamViewModel.kt`, and
`RegistrationLaunchPolicy.kt`. The local follow-up applies that generated patch exactly. The run's
Node.js 20 and `setup-java@v4` annotations are deprecation warnings, not this failure's cause; a new
remote run is still required to expose any downstream Android failure hidden by the early ktlint
exit.
