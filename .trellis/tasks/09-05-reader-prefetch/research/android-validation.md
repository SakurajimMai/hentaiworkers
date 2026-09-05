# Android Reader Validation

## Execution Status

Android validation runs remotely in GitHub Actions, in accordance with the mobile
build contract. No local Gradle build, emulator, or device test was run.

The existing `.github/workflows/build-android.yml` runs `ktlintCheck`,
`lintRelease`, `testDebugUnitTest`, `assembleDebugAndroidTest`, and `assembleRelease`,
plus APK identity, signing, resources, and ABI validation. This task added the
device-test APK compilation step; it does not execute device tests.

The reader changes were pushed directly to `main` as `0098adb`. Run #83 stopped
at Ktlint; its uploaded formatting patch was applied and pushed as `7d48198`.
[Run #84](https://github.com/SakurajimMai/hentaiworkers/actions/runs/33954709717)
succeeded at `7d4819825ddce7cd14ba11864ac6ee6d0a06dda2`: all five Gradle targets
passed, including compilation of the device tests. The uploaded XML reports
contain 78 tests across 17 suites with zero failures, errors, or skips. All 15
Coil/MockWebServer pipeline tests, 13 reader logic tests, and four preparation-store
tests passed. Android Lint reported zero errors and 35 warnings.

The `AnimeStream-apk-84` artifact contains five release-signed APKs with versionCode
84, build metadata, and SHA-256 checksums. Package, resources, launcher, signature,
archive integrity, and ABI validation passed in CI. All five downloaded APK
checksums also passed locally. The extracted APKs and reports are available under
`/tmp/reader-ci-TunqtJ/apk-84/` and `/tmp/reader-ci-TunqtJ/reports-84/`.
No GitHub Release was published. The follow-up verification-record commit does
not change Android application or workflow files.

Local verification performed for the added Android files:

- Read the pinned Coil 2.7 source for EventListener, ImageLoader, BitmapFactoryDecoder,
  MemoryCache, DiskCache, and Coil singleton APIs.
- Checked the test calls against the actual production reader APIs.
- Ran `git diff --check -- mobile/android/app/build.gradle.kts
  mobile/android/gradle/libs.versions.toml mobile/android/app/src/test
  mobile/android/app/src/androidTest` successfully.

These local checks alone do not establish Kotlin compilation or Android runtime
success; the remote build and JVM reports above provide the executed CI evidence.

## Implemented Tests

`ReaderLogicTest` replaces the old readiness-dependent and all-chapter registry
expectations with bounded directional preview/disk windows, visible URL exclusion,
deduplication, chapter edges, and restored positions.

`ReaderImagePipelineTest` contains 15 tests using a real Coil ImageLoader,
production reader fetcher and preloader, native Robolectric bitmap decoding, and
MockWebServer. Tests cover:

- A blocked current original with two speculative requests already in flight.
- The initial-only grace holding speculative work through 299 ms and releasing it
  at 300 ms even when the target is still loading; repeated positions cannot reset it.
- Cached-target and actual-page-movement bypasses without advancing the grace timer.
- Target preparation success and failure releasing lookahead before timer expiry.
- Next-page request time preceding its promotion to a display request.
- Preview/display promotion sharing one successful HTTP transfer.
- Visible original success while preview decoding remains deliberately blocked.
- Far-page file caching without invoking the real BitmapFactory decoder.
- Disk-hit then memory-hit display requests without another network request.
- Hot original cache skipping redundant preview work.
- A completed prepared preview surviving reader entry without another decode.
- A 256 x 32768 image producing a preview bounded by 480 x 1280.
- Restored middle-of-chapter position, reverse movement, and distant jumps.
- Failure, retry, cancellation, chapter replacement, and bounded active calls.

`ReaderDisplayInstrumentedTest` contains 5 tests rendering the actual
`ZoomableReaderPage` composable inside a continuous lazy list and recording
Telephoto's original-image display callback. It checks controlled green canvas pixels, delayed first-image handling,
lookahead before scrolling, preview decoding not gating actual paint, restored and
reverse positions, rapid jumps, failed-page retry, and a long page's finite viewport.

The device harness intentionally isolates image rendering and navigation. It does
not exercise the full ReaderScreen/ViewModel favorite, history, ad, and theme flows.
Those remain part of the full APK smoke test.

## Timing Evidence

The JVM suite prints `reader-pipeline-observations` with monotonic nanosecond
timestamps for network requests/completions/failures, real bitmap decoder calls,
Coil decode-stage starts/ends, and Coil success data sources. `NETWORK`, `DISK`, and
`MEMORY_CACHE` remain separate observations. A no-op disk decoder callback is not
counted as a bitmap decode. Concurrency counts non-canceled OkHttp calls; a canceled
socket waiting for its asynchronous `callFailed` notification is recorded as a
failure but is not counted as another active speculative download. Display time is
explicitly reported as not measured.

The five startup-grace cases use `TestCoroutineScheduler` only for preloader jobs
and the 300 ms timer. Coil execution, HTTP responses, and bitmap decoding still run
on real dispatchers against MockWebServer. This verifies ordering without fragile
wall-clock thresholds and does not claim an on-device 300 ms timing measurement.

The device suite emits `ReaderPipelineTiming` logcat entries with monotonic
millisecond timestamps for network requests, Coil starts, decode stages, source
results, viewport visibility, and actual Telephoto display callbacks. Canvas pixel
checks verify the controlled image rather than accepting a completed download as
proof of rendering. The first-page threshold is a generous functional timeout;
it is not a before/after performance benchmark.

## Rebuild APK In CI

1. Merge changes into `main`. A push that includes `mobile/**` or the Android
   workflow automatically runs **Build Android APK**.
2. Alternatively dispatch the existing workflow for `main` with
   `publish_release=false`:

   ```sh
   gh workflow run build-android.yml --ref main -f publish_release=false
   gh run list --workflow build-android.yml --branch main --limit 1
   gh run watch RUN_ID --exit-status
   gh run download RUN_ID
   ```

3. Require every build/quality/signing/ABI check to pass. Install the ABI-specific
   APK from the Actions artifacts, or the universal APK. Non-main branch artifacts
   use the internal debug signing mode and cannot replace an installed APK signed
   with a different certificate.
4. If formatting fails first, download `ci-gradle.log` and `ktlint-format.patch`,
   apply the exact formatting fixes, and rerun the workflow. Downstream lint,
   tests, and assembly are unverified when the quality command stops early.

## Run Device Coverage Remotely

Use an Android-enabled remote runner with Java 17, the project SDK, and a booted
API 28+ emulator or attached test device. Do not run these commands in this local
workspace, in accordance with the mobile build contract.

```sh
cd mobile/android
./gradlew connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=de.ixacg.animestream.reader.ReaderDisplayInstrumentedTest \
  --no-daemon --stacktrace
adb logcat -d -s ReaderPipelineTiming:I
```

Collect `app/build/reports/androidTests/connected/`,
`app/build/outputs/androidTest-results/connected/`, and timing logcat output.
The existing workflow would need an additional remote device job to automate this
command. The existing JVM and device-test compilation steps do not run it.

## Still Required Before Distribution

- A successful emulator/device instrumentation run, including canvas checks.
- Full APK smoke testing for persisted reading progress, favorite toggling,
  ads only after a visible original is ready, retry, chapter changes, theme, zoom,
  long-page pan/scroll handoff, and restoration after process recreation.
- Cold/hot cache measurements on a representative physical Android device and
  a before/after first-original-display comparison. No physical-device latency,
  memory pressure, decode, or first-display improvement is claimed from static
  inspection or from the JVM transport tests.
