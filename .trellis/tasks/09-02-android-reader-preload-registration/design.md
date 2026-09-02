# Android reader preparation and registration design

## Current flow and confirmed defects

The native client is Kotlin/Jetpack Compose. Reader data flows through `AnimeStreamViewModel -> CatalogRepository -> Retrofit/OkHttp`; images use Coil 2.7 and Telephoto 0.16 against the same site origin after `image.ixacg.de` URLs are rewritten through `/cdn-img`.

The current chapter path is strictly serial:

```text
chapter tap -> navigate -> ReaderScreen composition -> chapter API
            -> publish page URLs -> compose target page -> image request
            -> Telephoto isImageDisplayed -> prefetch next two pages
```

There is no chapter or target-image preparation before navigation. The prior performance change deliberately gates every following-page prefetch on the full current image, so a cold target page has no earlier work to reuse. Cold deep links additionally start home catalog requests from the ViewModel constructor and immediately request reader ads. API and image clients also use separate connection pools even though rewritten images use the API host.

Production read-only sampling on manga 585 chapter 1 returned the 24,654-byte chapter response in about 127 ms and the 130,911-byte first proxied image in about 130 ms from the server environment. This rules out a consistently slow server for that sample, but does not replace cold/warm physical-device timing.

## Reader preparation

Introduce a small `ReaderPreparationStore` keyed by manga ID and normalized chapter number. It provides:

- single-flight loading for matching concurrent prepare/load callers;
- a two-entry LRU result cache with a short TTL;
- automatic eviction after failures so retry remains possible;
- no reader UI mutation and no history writes during preparation.

`prepareReader()` runs from the ViewModel scope. Manga detail schedules only its default chapter after a short delay, avoiding work for screens that are immediately left. Every explicit reader navigation also calls preparation first. `loadReader()` consumes the same store, then publishes the existing `ReaderContent` and performs history/optional-detail work only after the destination is active.

The preparation request warms only the bounded target page through the application `ImageLoader`. It uses the same original URL and disk-cache key as the full reader request, plus a dedicated bounded preview memory key. The preview is a temporary display source; Telephoto still loads the full source and remains responsible for full-quality display and subsampling.

The page component supplies `placeholderMemoryCacheKey`. A cached placeholder removes the blocking spinner and unlocks one following-page disk prefetch. `isImageDisplayed` remains the authoritative full-image signal and unlocks a total window of two following pages after two rendered frames. URL reservation remains unique per chapter.

The preloader publishes per-key `Idle`, `Loading`, and `Ready` state. When the target page enters
composition while its preview is still loading, only that page defers the original request. It
starts the original on preview success or failure, so a late placeholder is visible and the same
source is not downloaded concurrently. An existing original memory-cache hit bypasses this gate.

## Network contention

Home loading moves from unconditional ViewModel construction to `HomeScreen` entry through an idempotent `ensureHomeLoaded()`. This preserves normal startup behavior while keeping reader/player deep links free from catalog requests.

Reader ads begin only after a manga page is fully displayed. Already-cached ads remain immediately usable. The API and image OkHttp clients share a `ConnectionPool` and `Dispatcher`, while retaining separate cookie/header interceptors, so same-origin DNS/TLS/HTTP2 work can be reused without sending session cookies to image requests.

## Registration boundary

The repository has a complete website registration flow but no JSON registration endpoint. The website flow owns registration-open settings, email whitelist, Turnstile, per-IP/account rate limiting, optional SMTP verification, and server-side identity validation.

The APK therefore exposes a registration action that opens the validated `${MediaUrlNormalizer.origin}/register` URL in a browser. This is a deliberate security boundary: adding a native endpoint that skips Turnstile would expose bulk account creation, while emulating Next Server Actions or embedding a secret in the APK would be unstable or insecure. Browser cookies are not imported into the APK; after registration/verification users return and use the existing APK login, which already persists the session cookie before publishing logged-in state.

Both Account and Login screens receive a boolean registration launcher callback. A failed launch becomes inline form feedback. The action uses an established Material icon, full-width 52dp control, existing colors, and clear login/registration hierarchy.

## Compatibility and rollback

- No database, manga API, package ID, signing, or deep-link contract changes.
- Preview warmup is bounded and final resolution is unchanged.
- Preparation cache and image disposable are process-local and safe to discard.
- Removing the prepare calls restores the old reader flow without data migration.
- Removing the registration buttons does not affect website accounts or sessions.

## Verification

Pure policy/store tests cover single-flight, TTL/capacity, failure retry, restored-target selection, readiness windows, and lazy home startup. Existing MockWebServer tests continue covering chapter and cookie contracts. Root checks run locally; GitHub Actions is authoritative for Kotlin formatting, Android lint/tests, APK assembly, identity, ABI, resources, and signing. Physical-device cold/warm traces remain required before claiming measured APK TTIR improvement.
