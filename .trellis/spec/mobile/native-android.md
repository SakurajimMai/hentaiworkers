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
- Production upgrades require the existing release signing key. An ephemeral debug key is
  only valid for an explicitly marked internal Actions artifact.
- A `main` build may create a GitHub Release only when all four release-signing secrets are
  present. Partial signing configuration must fail.
- The first native launch must idempotently import the five known `RKStorage` values without
  deleting the old database or overwriting newer native rows.

## 3. Runtime Contracts

- Retrofit/OkHttp DTOs follow the existing public API; do not change server responses for the
  client rewrite.
- Invalid API origins and media URLs fail closed or use the documented production fallback.
- Logged-out library data uses Room; the target-site session and migration version use
  DataStore; login performs best-effort local-to-cloud merging.
- OkHttp cookie callbacks update memory immediately and serialize DataStore writes. A
  successful login must await its session-cookie write before exposing logged-in state so an
  immediate process restart cannot lose the session.
- Media3 owns MP4/HLS playback. Main playback waits until the pre-roll decision is ready, and
  lifecycle pauses must neither display pause ads nor resume a user-paused video.
- The reader remains a continuous vertical reader. Use lazy page composition and a proven
  subsampling/zoom library; prefetch only a bounded preview into the disk cache so long images
  are not decoded eagerly into memory.
- An image whose scaled height can exceed practical Compose item constraints must use a finite
  subsampling viewport with base-scale vertical pan and nested-scroll handoff. Do not squash the
  image, clip away unreachable content, or request an intrinsic million-pixel layout height.
- Reader progress uses stable page keys, a visible-page fallback for unusually tall pages,
  and the established debounce before persistence.

## 4. Build And Verification Boundary

Developers edit Android code locally but do not run `gradlew`, Android Studio builds,
emulators, device tests, or any local Android compilation. GitHub Actions is the authoritative
Android build environment and must:

1. Validate the committed Gradle wrapper and install Java 17 plus the Android SDK.
2. Run Kotlin formatting, Android Lint, JVM/Robolectric tests, and `assembleRelease`.
3. Verify APK package, versionCode, launcher activity, archive integrity, and signature.
4. Reject React Native, Hermes, Metro, Expo, or JavaScript bundle remnants.
5. Build and validate real `arm64-v8a`, `armeabi-v7a`, `x86_64`, and `x86` splits plus a
   universal APK. Every split must contain only its target ABI and match the corresponding native
   libraries in the universal APK.
6. Upload all five APKs and diagnostic reports; publish them to GitHub Releases only from a
   formally signed `main` build.

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
- Workflow changes: parse YAML in root tests and assert checks, identity validation, signing
  mode, release gate, and absence of the JavaScript runtime.
- Final task validation: root quality commands, `git diff --check`, remote Android workflow,
  then a focused real-device smoke test before production distribution.
