# Feed cards and configurable site SEO

Remove the feed banner option, homepage strip, and spanning layouts across web and Android. Existing creatives become ordinary feed cards without losing content. Keep reader/player slots and editorial hero slides.

Admins can save site title, subtitle, summary, and keywords. Apply defaults for existing installations, preserve omitted fields on partial updates, refresh metadata on save, and reflect values in root metadata and homepage structured data. Keep page-specific metadata and indexing rules.

Acceptance: regression tests, lint, typecheck, boundaries, build and ad/meta browser checks pass. Android changes receive source/test review; project requires Android CI validation.

## Additional user requirements (same session)

- Admin users page can delete ordinary user accounts, with explicit UI confirmation, server-side admin authorization and protection for administrator accounts. Remove associated private data transactionally; deleted sessions become invalid.
- Public registration requires a six-digit email code regardless of legacy optional setting. Pending accounts cannot log in. Codes expire, are single-use, are bound to email and rate limited. Support resend for pending registrations; SMTP must be ready before creating an account. Existing email links remain accepted until expiry. Do not weaken captcha/whitelist rules.
