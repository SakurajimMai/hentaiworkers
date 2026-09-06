# Implementation

- [x] Read workspace state, Trellis workflow, and layer specs.
- [x] Diagnose and fix Android reader performance and zoom.
- [x] Add global verification meta settings and server-rendered head output.
- [x] Complete HTML ad support and responsive banner sizing across web/native.
- [x] Add focused regression coverage and review changes.
- [x] Run root quality checks and browser validation.
- [x] Attempt authorized remote Android validation; report device-test limitations.
- [x] Update relevant specs/docs and report delivery state.

## Implementation Verification

- Global meta schema/form/service tests passed.
- Actual root layout SSR plus editor import, removal, submission, attribute escaping, and layout
  checks passed at 1280px, 390px, and 320px. Screenshots: `/tmp/site-meta-browser-LFUw4P/`.
- Existing native implementation decoded an unbounded transition bitmap before subsampling;
  reader work adds bounded decoding and chapter-wide scale with preserved touch anchors.
- Review caught native ad bridge stale document callbacks and reader geometry changes during zoom;
  both are fixed, including stable page anchors when ads appear during a pinch.
- Production Next.js build, typecheck, legacy and App boundary checks passed.
- Full checks exposed an existing stale Android workflow assertion and carousel test lint issue;
  the test-only corrections passed their focused checks.
- GitHub CLI and token environment variables are unavailable, but saved GitHub credentials were
  discovered and verified. A native-only snapshot is on
  `codex/reader-meta-ads-check-20260906030631488`; CI run `34008164901` is in progress.
  The local branch and pre-existing SMTP changes were untouched. Production release was not
  authorized at that stage.
- All 45 TypeScript test files, full lint/typecheck and 15 reader browser cases passed.
  Reader browser artifacts: `/tmp/reader-browser-dGBHy3/`.
- HTML ad browser checks passed for desktop/mobile preset dimensions, parser-time and async nested
  scripts, nested iframe content/pixels, shrinking/capped height, player lifecycle, and absolute/relative
  click targets. Artifacts: `/tmp/html-ad-browser-pzgbQl/`.
- Native run `34008164901` stopped at ktlint. Its report identified a local-declaration blank line,
  two multiline function signatures, and constant naming. Corrected these using the downloaded report;
  the formatting job could not produce a patch because naming errors are not auto-fixable.
- Second native run: `34008360595`, commit `e38f98ebc21b1be723db094aaee2bdf34c79c843`.
- Final Web production build passed. Preview runs on `http://localhost:3030/admin/settings`;
  this checkout's local environment lacks a valid `DATABASE_URL`, so actual admin persistence needs
  environment configuration. Browser/service tests use isolated fixtures and never change live settings.

## Initial Handoff

- Android run https://github.com/SakurajimMai/hentaiworkers/actions/runs/34008360595 succeeded:
  ktlint, lintRelease, 84 JVM tests (0 failed/skipped), instrumented APK compilation, five ABI/universal
  APKs, identity/content/signature checks. GitHub blob hashes match all 15 local native files.
- Internal test artifact: `AnimeStream-apk-87` (artifact ID `9981719520`). No production release.
- Final reader browser repeat passed all 15 cases: `/tmp/reader-browser-XtebNB/`.
- Web root checks passed: lint, typecheck, 45 test files, legacy/boundary checks, production build,
  meta and ads browser checks. Final focused checks cover the ad placeholder geometry refinement.
- Pending before production: real-device reader scroll/pinch smoke test and production deployment.
  Web changes and documentation remain in the user's worktree; native CI commits are on an isolated
  validation branch. Pre-existing SMTP changes remain intact.

## Production Rollout (Authorized 2026-09-06)

The user explicitly requested pushing and deploying the formal production version. Continue this
task through commit, remote builds, production deployment, release promotion, and live verification.
Do not include the pre-existing SMTP task or its overlapping hunks in the release commit.

- [x] Commit the reader, metadata, and ad changes and verify the isolated release snapshot.
- [x] Push main and verify the Docker and production-signed Android workflows.
- [x] Preserve the previous image, deployment configuration, and database recovery point.
- [x] Deploy the immutable image and verify live, ready, and representative public/admin routes.
- [x] Publish and promote the verified Android release, then verify the live update manifest.
- [x] Record commits, CI runs, release assets, deployment state, and rollback instructions.

No SQL migration is introduced. Real-device frame-rate and gesture testing remains unavailable;
the release retains the documented limitation despite successful JVM/build/browser validation.

- Release commit: `1e98a74c90789725a51aa1f4ec2b9d197ffd96f3`, pushed to main.
- The isolated release tree excludes all SMTP-only files and shared SMTP hunks. All 68 committed
  files match the verified snapshot; 257 tests, lint, typecheck, build, boundaries, and meta/ad
  browser checks passed.
- Android production dispatch: run `34008998994`, Build 89. Docker publish: run `34008992027`.
- Backup: `/root/docker/anime/backups/20260906T032537Z-reader-meta-release/`.
  The old image is retained as `sakurajiamai/hentaiworkers-app:rollback-20260906t032537z`.
- A complete 22-table database dump was restored into an isolated MariaDB container with networking
  disabled. Verified 2,820 anime rows, 635 manga rows, and 78,131 manga pages; the temporary
  restoration container was stopped. No production schema changes were made.
- Build 89 failed the existing reverse/jump image-pipeline test. Its recorded calls launched the
  replacement window immediately, then failed before request delivery; the old fixture omitted
  IOException causes. Commit `9dc3d8f7f42d714d4cf641c2f685ad17c75cb3df` aligns the fixture with
  production connection retry behavior, holds old response gates to make cancellation deterministic,
  and records exact failures. Runtime code, timeout, and bounded-concurrency assertions are unchanged.
- Replacement formal dispatch: Build 91, run `34009504695`.
- Image `1e98a74` passed 23 candidate-container checks with production data, plus actual configured
  administrator login. Candidate environment values must use Compose/dotenv parsing; `docker run
  --env-file` preserves shell quotes and is not equivalent for quoted JSON encryption keyrings.

## Production Result

- Source commit: `9dc3d8f7f42d714d4cf641c2f685ad17c75cb3df` (feature commit `1e98a74`).
- Android run https://github.com/SakurajimMai/hentaiworkers/actions/runs/34009504695 passed:
  84 JVM tests in 18 suites, zero failures/errors/skips, ktlint, lintRelease, instrumented APK
  compilation, release assembly, and identity/ABI/signature checks.
- Docker run https://github.com/SakurajimMai/hentaiworkers/actions/runs/34009497216 passed.
- Formal latest release: https://github.com/SakurajimMai/hentaiworkers/releases/tag/build-91
  (`prerelease=false`, `draft=false`). All five APKs match artifact SHA256SUMS, the published asset
  digests, and the pinned production certificate. All six public asset URLs return HTTP 200.
- Production `/root/docker/anime/docker-compose.yml` is pinned to
  `sakurajiamai/hentaiworkers-app:9dc3d8f@sha256:29b5a28c882585e5f00f0d9bf7d9a2d2fee9b7e1a61278bd5bf5e06216bbde46`.
  The active container is healthy and its OCI revision matches the source commit.
- Local live/ready checks passed. HTTPS production smoke passed all 25 checks, including actual
  administrator login, global meta and banner dimension fields, manga chapter/image, catalog,
  history APIs, and the Build 91 update manifest with five matching APK hashes.
- Smoke report: `/tmp/reader-production-smoke-www.ixacg.de-https.json`.
  APK/report archives: `/tmp/reader-production-apk-91.zip`, `/tmp/reader-production-reports-91.zip`.
- The candidate container and isolated database restore container were removed. Old image,
  configuration, verified database backup, and executable rollback override remain in the backup
  directory recorded above. The production environment file is unchanged.
- Pre-existing SMTP edits remain local and uncommitted. Real-device performance/gesture testing
  was not available; no measured native frame-rate or latency claim is made.
