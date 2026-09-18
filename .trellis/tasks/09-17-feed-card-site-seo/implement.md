# Implementation

- [x] Remove feed banner model, UI, rendering, Android branches; update compatibility tests and docs.
- [x] Add site SEO configuration, form, service merge and metadata output with regression tests.
- [x] Run lint, typecheck, tests, boundary checks, build, browser tests and diff review.
- [x] Implement ordinary user deletion, role protection, transactional cleanup and tests.
- [x] Enforce registration verification, code entry/resend, mail injection for tests, expiry/replay/rate-limit tests.
- [x] Re-run affected checks and update user/admin docs.

## Validation evidence

- TypeScript tests: 54 test files passed, including transaction rollback, admin protection,
  deleted-session rejection, mandatory verification, code expiry/email binding/replay/rate limits,
  legacy-token bypass rejection, SEO persistence and old ad compatibility.
- Lint, typecheck, check:legacy, check:boundaries and git diff --check passed.
- Ad browser checks passed using existing Chromium; artifacts `/tmp/html-ad-browser-zQpUwj`.
- Meta SSR/editor checks passed at 1280/390/320px; artifacts `/tmp/site-meta-browser-AWmcyu`.
- Production build: passed on the final code (Next.js 15.5.20).
- No production user data changed. Actual SMTP delivery requires deployment configuration and
  a real test recipient. Android build remains CI-only and has not been triggered this session.
