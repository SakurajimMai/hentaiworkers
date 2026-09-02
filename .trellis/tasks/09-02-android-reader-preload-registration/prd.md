# Improve Android reader preloading and add registration entry

## Goal

Reduce the Android reader's time from choosing a chapter to seeing the target page, keep nearby pages ready during continuous reading, and let logged-out APK users start the existing secure registration flow.

## Requirements

- Start a bounded chapter/image preparation before reader navigation when the user expresses reading intent.
- Reuse matching prepared or in-flight chapter data instead of cancelling it and issuing the same chapter request again.
- Warm the bounded restored target page, not page zero, and retain full-resolution delivery through Coil and Telephoto.
- A prepared low-resolution preview may replace the page spinner while the full-quality image loads, but it must never replace or lower the final image quality.
- Keep continuation prefetch bounded: a preview may unlock one following page and a fully displayed current page may unlock at most the next two.
- Failed preparation must be retryable, stale chapter work must not overwrite the active reader, and preparation alone must not write reading history.
- Cold reader deep links must not compete with unconditional home or reader-ad requests; normal home loading and update checks must continue when the home screen is actually entered.
- Existing reader page order, restored page, slider behavior, progress persistence, per-page retry, zoom/subsampling, ads, and safe-area behavior must remain correct.
- Logged-out users must see a registration action in both Account and Login screens.
- Registration must reuse the existing website registration policy, including registration-open state, whitelist, Turnstile, rate limiting, and optional email verification. The APK must not bypass those controls or embed a registration secret.
- A browser handoff failure must produce visible, actionable feedback in the APK.
- Preserve the independent native Android boundary and do not change public manga API response shapes.
- Do not run Gradle, an emulator, or an Android build locally; Android verification belongs to GitHub Actions and a physical-device smoke test.
- Preserve all pre-existing SMTP task changes and the untracked root `design.md`.

## Acceptance Criteria

- [x] Opening the default chapter after a short stay on manga detail reuses one prepared chapter request and can show its cached preview without waiting for a new download.
- [x] Tapping any chapter starts preparation before navigation, and the destination adopts the same in-flight result without a duplicate chapter API request.
- [x] Restoring page 201 prepares page 201 first; it never warms page 1 as the target.
- [x] Preview/full readiness schedules at most one/two following unique URLs respectively, and failed warmups can be retried.
- [x] Existing pages remain visible during a same-chapter cache hit or refresh instead of returning to a full-screen spinner.
- [x] A cold reader deep link does not start home catalog or ads before the target image is displayed.
- [x] Account and Login screens both expose a 48dp-or-larger registration action that opens the validated site `/register` URL and reports launch failure.
- [x] Registration still enforces website registration settings and tells users to return to the APK to log in after browser registration or email verification.
- [x] Focused Kotlin policy/contract tests cover preparation, bounded prefetch, retry, registration URL construction, and lazy home loading.
- [ ] Root typecheck/tests/boundary checks pass; the remote Android workflow passes formatting, lint, JVM tests, identity checks, and release assembly before distribution.
