# Design

Remove placement from domain/editor/public types and rendering; schema strips legacy placement without deleting HTML. Keep the existing enabled public-slot indexing. Android uses only card geometry.

Add a validated site SEO object with existing defaults, parse it in the admin action, merge partial settings in the service, cache public SEO using the existing metadata invalidation tag. Pure metadata builder composes root title, description, keywords, OG/Twitter; homepage WebSite uses configured title/summary. Avoid raw head HTML and filter manually imported metadata that conflicts with managed SEO.

No database migration, crawler, deployment or catalog changes. Existing reader/player ads retain behavior. Rollback by reverting code; settings are additive.

## Identity extension

Reuse inactive users and email_verification_tokens: email-bound hash of random six-digit code, maximum ten-minute expiry, atomic token consumption, pending-only resend with per-email and per-IP throttling. Remove the optional verification switch while retaining public compatibility field always true. Registration is unavailable until SMTP is configured. Admin role/status changes revoke pending tokens to prevent reactivation. Preserve existing link verification through POST.

User deletion belongs to IdentityService and UserRepository. Repository locks ordinary target, removes list items, lists, favorites, progress, events, verification/reset tokens in one transaction, then deletes user. Never delete admin targets. No schema changes.
