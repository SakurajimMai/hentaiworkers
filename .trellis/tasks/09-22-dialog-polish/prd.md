# 统一确认弹窗交互与视觉样式

## Goal
Replace browser-owned validation bubbles in the web application with accessible, themed inline feedback and repair/polish shared confirmation dialogs across the public site and admin.

## Findings
- No executable alert(), confirm(), or prompt() calls exist under app/, components/, or lib/.
- ConfirmDialog has hardcoded dark colors, identical danger/default actions, no focus containment/restoration, and is rendered inside potentially clipped/transformed ancestors.
- Native constraint-validation bubbles remain on auth, account, admin catalog/tag/user/settings forms.
- Standalone generated architecture documentation contains alert calls; it is not application UI.

## Acceptance criteria
- All constrained public/admin forms display accessible inline errors instead of browser validation bubbles after hydration, while preserving required, email, pattern, length and numeric constraints.
- Invalid forms never invoke server actions. Corrected forms and confirmation actions still submit correctly; existing server validation remains authoritative.
- Confirmation dialogs match explicit light/dark and system themes; destructive actions are visually distinct.
- Opening focuses the safe action; Tab stays in the modal; Escape/cancel closes without submitting; closing restores focus where possible.
- Modal remains above page chrome and is usable at 320px width, short landscape heights, long messages, and reduced motion settings.
- Browser regression checks cover cancellation, submit-once, constraint errors, correction, focus, themes, and responsive layouts. Lint, typecheck, unit tests and app boundaries pass.

## Boundaries
Web application frontend only. No API/database changes, Android changes, dependency additions, blanket window API overrides, browser permission dialog suppression, or unrelated page redesign. Native selects/date/file pickers are not alert dialogs and remain platform controls. Generated architecture documentation is outside the runtime scope.
