# Implementation

- [x] Read workspace state, Trellis workflow, and layer specs.
- [x] Diagnose and fix Android reader performance and zoom.
- [x] Add global verification meta settings and server-rendered head output.
- [x] Complete HTML ad support and responsive banner sizing across web/native.
- [x] Add focused regression coverage and review changes.
- [x] Run root quality checks and browser validation.
- [x] Attempt authorized remote Android validation; report device-test limitations.
- [x] Update relevant specs/docs and report delivery state.

## Verification So Far

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
  The local branch and pre-existing SMTP changes are untouched. No production release is authorized.
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

## Final Result

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

- [ ] Commit the reader, metadata, and ad changes and verify the isolated release snapshot.
- [ ] Push main and verify the Docker and production-signed Android workflows.
- [ ] Preserve the previous image, deployment configuration, and database recovery point.
- [ ] Deploy the immutable image and verify live, ready, and representative public/admin routes.
- [ ] Publish and promote the verified Android release, then verify the live update manifest.
- [ ] Record commits, CI runs, release assets, deployment state, and rollback instructions.

No SQL migration is introduced. Real-device frame-rate and gesture testing remains unavailable;
the release retains the documented limitation despite successful JVM/build/browser validation.
