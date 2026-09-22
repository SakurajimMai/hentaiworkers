# Design

## Shared confirmation
Keep ConfirmDialog and ConfirmSubmitButton as the single implementation used by existing callers. Use a fully styled HTML dialog opened via showModal() to obtain the browser top layer and background inertness; this is application UI, not window.confirm(). Synchronize controlled open state, cancel events and cleanup; explicitly focus cancel and restore the invoking element. Provide constrained height, internally scrollable content, stable footer, theme tokens, danger styling, and reduced-motion-aware entrance effects. ConfirmSubmitButton must retain its server-action requestSubmit path and avoid bypassing validation via form.submit().

## Form feedback
Introduce a client form wrapper with a native form-compatible interface so server pages can retain server actions and server-rendered children. Handle invalid events to cancel the browser bubble, report the invalid field with an accessible description and focus the first invalid field. Keep native constraint validation enabled; do not use noValidate to silently weaken checks. Clear/re-evaluate feedback as fields change and handle multiple invalid controls without repeatedly moving focus. Preserve existing aria-describedby values and server-provided errors. Use field relationships stable across repeated row forms and dynamic inputs; avoid root-level document event interception.

## Integration scope
Update the constrained AdminPagination GET form and constrained forms in public login/register/verify-email/forgot-password/reset-password/account and admin login/account/animes detail/mangas detail/tags/manga-tags/users/settings. Settings wrapper must cover constrained fields in site-meta-editor and ad-size-fields. Audit all app/components form constraints again after integration. Unconstrained search/logout forms need no conversion.

## Presentation
Use existing surface, ink, line, danger and focus tokens. Clear title/message/action hierarchy, restrained radius/shadow, minimum 44px action hit targets, responsive footer and readable long text. Preserve existing visible action labels and confirmation messages.

## Compatibility and rollback
No external dependencies or public API changes. SSR form markup and progressive native validation remain usable before hydration. Reverting the shared UI and form-wrapper call-site changes restores previous behavior without data migration.
