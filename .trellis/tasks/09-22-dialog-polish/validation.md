# Validation

## Scope
- Shared confirmation dialogs, ConfirmSubmitButton and inline constraint feedback.
- 22 constrained form declarations across 14 route files and AdminPagination; repeated row forms share the same wrapper.
- Added frontend component conventions. No API, database, Android or generated documentation changes.

## Checks
- npm run lint: passed.
- npm run typecheck: passed.
- npm run test: 339 passed, 0 failed.
- npm run check:boundaries: passed.
- npm run test:dialogs:browser: passed, including the final long-content keyboard scrolling regression.
- git diff --check: passed.

## Browser evidence
Real Chromium, actual shared components, React StrictMode and real DOM constraint validation. Fixture actions record submissions without modifying real user data. Covers cancellation/Escape/backdrop, top-layer rendering inside a clipped transformed parent, Tab/Shift+Tab, keyboard scrolling of overflowing content, focus restoration, double click, invalid and corrected submissions, required/email/minLength/pattern/numeric constraints, reset, readonly changes, dynamic field removal/reinsertion, actual SiteMetaEditor rows, direct-flex form errors, explicit/system themes, reduced motion, desktop/320px/390px/short landscape screenshots.

Screenshots visually reviewed (light/dark/mobile/landscape). Final artifacts: `/tmp/dialog-browser-ClHkBI`. This is component integration coverage; no live database-backed destructive action was performed.

## Approved commit
One coherent commit: `fix(ui): polish confirmations and inline form validation`.
Includes all changes from this task: components/ui/confirm-dialog.tsx, components/confirm-submit-button.tsx, components/validated-form.tsx, components/admin/admin-pagination.tsx; constrained form integrations in app/(site)/{account,forgot-password,login,register,reset-password,verify-email}/page.tsx and app/admin/{account,animes/[id],login,manga-tags,mangas/[id],settings,tags,users}/page.tsx; app/globals.css; package.json; tests/browser/dialogs.mjs; .trellis/spec/frontend/component-guidelines.md; .trellis/tasks/09-22-dialog-polish/ planning and validation artifacts.
Working tree was clean at task start. No unrecognized user changes found. User approved this commit on 2026-09-22. No push requested.
