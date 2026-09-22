# App-Only Boundary

## 1. Scope / Trigger

Apply this contract when changing server modules, route handlers, database schema or
migrations, root scripts, environment variables, Docker Compose, Dockerfiles, or image CI.

AnimeStream's deployed product is a single Next.js application. Independent data acquisition
projects may live under the repository root `crawler/` workspace, but are outside the App
runtime and deployment boundary.

## 2. Signatures

Required verification commands:

```text
npm run typecheck       -> tsc --noEmit
npm run test            -> deterministic discovery of tests/**/*.test.ts
npm run check:boundaries -> exit 0 only for an App-only repository
docker compose config   -> services.app is the only declared service
```

Supported server route groups:

```text
GET /api/animes*
GET /api/mangas*
GET /api/tags
GET /api/ads
GET /api/android/update
GET /api/{live,ready,health}
GET|PUT|DELETE /api/me/watch-progress*
```

## 3. Contracts

Runtime environment keys are App-owned:

| Key | Requirement |
|-----|-------------|
| `DATABASE_URL` | Required MySQL URL |
| `DATABASE_TLS_MODE` | `required`, except local loopback may use `disabled` |
| `SITE_URL` | Canonical public origin |
| `ANDROID_UPDATE_REPOSITORY` | Optional `owner/name` GitHub repository for `/api/android/update`; unset returns 404. CI images default it to the repository that built them |
| `APP_IMAGE` | Compose image name (`owner/name`); the tag comes from `IMAGE_TAG` |
| `INDEXNOW_ENDPOINT` | Optional override of the IndexNow submission endpoint |
| `SESSION_SECRET` | Required, at least 32 characters and not a placeholder |
| `APP_ENCRYPTION_KEYRING` | JSON keyring of canonical 32-byte Base64 keys |
| `APP_ENCRYPTION_CURRENT_KEY_ID` | Must identify a key in the keyring |

Deployment identity never lives in source: hosts, GitHub accounts/repositories and registry image
names come from these keys, from GitHub repository variables in workflows, or from Gradle
properties in the Android build. A missing value disables the feature (503/404/skipped) rather
than falling back to a built-in default. The publish workflow may bake `github.repository` into
the image as an `ENV` default (a `Dockerfile` `ARG` that is empty in source); `deploy/.env`
overrides it, and the `.env` templates keep the key commented out so a copied template cannot blank
the default. `GET /api/health` reports `features.androidUpdates` and `features.imageProxyDomain` so
a deployment problem is visible from outside instead of only as 404/403 answers inside the app.

`/cdn-img/<host>/**` needs no configuration: it proxies exactly the hosts under the site's own
domain, derived from `SITE_URL` (the site host minus its first label when it has one to spare,
guarded by a short list of two-label public suffixes such as `co.uk`), so `image1.example.com`,
`image2.example.com`, ... work as soon as the catalog uses them. The site host itself and every
host outside that domain are refused (403) before any fetch, and only `image/*` bodies are relayed.
The Android client applies the identical rule from its API origin; keep the two implementations
(`lib/server/image-proxy.ts`, `MediaUrlNormalizer`) in step, with matching test examples. Paths
without a host segment come from clients built before Build 112; resolve them by trying the hosts
of the newest catalog covers (bounded attempts, in-domain only, cached) rather than by reintroducing
a configured upstream.

The App must not contain or import a data-acquisition runtime, machine identity/token API,
shared media-output filesystem, or a second Compose service. A root `crawler/` project must
own its dependencies and tests, remain excluded from the App Docker context, TypeScript and
ESLint, and keep production configuration ignored. Catalog media fields contain
browser-accessible URLs.

The App does not run migrations, but two read paths still issue `CREATE TABLE IF NOT EXISTS`
on the request path as a bounded, documented exception: manga ranking/progress
(`manga_view_days`, `manga_view_dedup`, `manga_reading_progress`) and anime view tracking
(`anime_view_days`, `anime_view_dedup`). The bootstrap is one cached promise per process that
resets on failure, and the recording path must never throw into its caller. Prepare these tables
through reviewed migrations (`0017`, `0018`, `0020`); lazy creation is not a migration and must not
be extended to any other table.

Anime and manga view counts are real: one counted view per viewer per work per UTC day, keyed by
the logged-in user id or a hashed client IP. The anime path also increments `animes.view_count`,
which stays the cheap counter behind list responses and `sort=popular`; an unknown or inactive id
is not counted. Anime favourite counts are derived live from the system favourites lists
(`user_lists.list_type = 'favorites' AND is_system = 1` joined to `user_list_items`). The stored
`animes.favorite_count` column is retained for schema history only and must not be read or written.
A count that cannot be computed is reported as `null` (unknown); never substitute a placeholder
number. `0020-anime-views.sql` clears the crawler's random `view_count` seeds as executable SQL, so counts
are real from the moment it is applied. Any future reset of a counter belongs in a reviewed
migration for the same reason: the App itself must never issue that kind of bulk write.

Pure control-plane tables and `anime_sources` do not belong to active App schema or migration
tooling. Historical migrations `0010`-`0013` remain immutable, but App code must not read or
write their works tables. Removal work never drops tables or rewrites stored catalog rows
automatically.

Public anime, manga, tag, and ad reads may use a module-local stale-while-revalidate cache only at
the production dependency boundary. Settled catalog values use a strictly bounded LRU (64 query
keys for anime/manga, one for tags/ads); a separate transient in-flight registry provides same-key
single-flight and must not refill state after `clear()`. Preserve the existing JSON/status contract,
propagate cold-load failures, bound stale lifetime, and never apply this cache to identity, library,
progress, administration, or other private reads.

Private favorites and progress pages must use one repeatable-read, read-only transaction to count
the visible collection, clamp the requested page, and issue a bounded `LIMIT/OFFSET` query. Order
by the activity timestamp and a unique record ID so equal timestamps cannot duplicate or omit rows
across page boundaries. Web Server Components consume these paged services directly and expose page
state in the URL. A legacy mobile endpoint may retain its documented full-list default response for
compatibility, but web rendering must not use that unbounded path.

`GET /api/android/update` is a database-free public read from the GitHub Releases of the
repository named by `ANDROID_UPDATE_REPOSITORY`. Include prereleases, but accept only
non-draft `build-N` releases targeting `main`; require exactly one uploaded, non-empty asset for
each of `arm64-v8a`, `armeabi-v7a`, `x86_64`, `x86`, and `universal`, plus `SHA256SUMS`.
Every accepted asset must carry a valid SHA-256 digest and the exact HTTPS filename/path under
that repository's release tag. Select the greatest complete `N`; malformed or incomplete newer
releases must not hide an older complete release.

The Android update manifest uses its own one-key process-local stale-while-revalidate cache:
15 minutes fresh, 24 hours stale, same-key single-flight, and bounded failure backoff. It must not
reuse or be confused with the catalog cache's 30-second fresh policy. A cold upstream request has
a short timeout and propagates failure through the documented public error contract; a cached
stale manifest remains available during a temporary GitHub failure.

Trusted Android and Docker workflow runs must finish with a repository-wide Actions retention
job. Sort every paginated workflow run by creation time and id, retain the latest five overall,
and delete only older completed runs. Keep `actions: write` scoped to that cleanup job, serialize
the two cleanup jobs with one shared concurrency group, and skip write access for pull requests.

Artifact retention is separate from run retention: the Android release job keeps the newest eight
`build-N` GitHub Releases (deleting older releases and tags), and the Docker workflow keeps the
newest eight commit-SHA image tags on Docker Hub while never touching rolling (`latest`, `manga`,
branch) or semver tags. The Docker Hub token must carry delete permission; a refused delete fails
the retention job loudly instead of silently accumulating tags.

## 4. Validation & Error Matrix

| Condition | Required result |
|-----------|-----------------|
| Forbidden runtime path, npm command, env key, table identifier, or Compose service | `npm run check:boundaries` fails and names the source |
| Missing/invalid App configuration | `AppError('CONFIG_INVALID', ..., 500)` |
| Remote database disables TLS or uses a non-DNS host | Configuration parsing fails |
| Removed route is requested | Normal Next.js 404; no compatibility handler |
| Existing database still contains removed tables | Ignore; do not issue destructive SQL |
| View/favourite count cannot be computed | Report `null` (unknown); never emit a stored placeholder or a synthetic number |
| Catalog contains a removed local-media URL | Correct operationally; do not read host files from App |
| GitHub update release is draft, non-main, incomplete, or has an invalid asset path/digest | Ignore it and select the greatest older complete `build-N`; return the documented upstream error only when no cached valid manifest exists |
| `/cdn-img/<host>/**` names the site itself or a host outside the `SITE_URL` domain | 403 before any upstream request; never cached |
| `/cdn-img` upstream answers non-2xx, a non-image body, or is unreachable | Relay the status (404 for non-image bodies, 502 when unreachable) with `Cache-Control: no-store` so the app can fall back to the direct host |
| `ANDROID_UPDATE_REPOSITORY` unset or malformed at runtime | `/api/health.features.androidUpdates` is `false`; the route keeps answering 404 |
| `crawler/**/production_config.yml` exists locally | Keep ignored; commit only a sanitized example |

## 5. Good / Base / Bad Cases

- Good: add a catalog query through a port and MariaDB repository, then expose it from an App
  route with contract tests.
- Good: derive a displayed count from the rows that actually own it, and report `null` when the
  derivation fails.
- Base: render an absolute `cover` or `video_url` already stored in `animes`.
- Good: keep a Python producer under `crawler/` with its own dependencies and ignored runtime
  configuration.
- Bad: import crawler code into the App, add a machine-token endpoint, local media mount, or
  second service to the root Compose.

## 6. Tests Required

- Route/API changes: handler tests with injected dependencies and public contract assertions.
- Backend service changes: unit tests for validation, successful behavior, and propagated
  errors.
- Deployment changes: parse both Compose files and assert exactly `services.app`; inspect the
  image workflow and secret exclusions.
- Boundary changes: add the forbidden path/content to `scripts/check-app-boundaries.mjs`, prove
  the check detects it, then verify the clean tree passes.
- Crawler changes: run its focused tests or syntax checks, verify production configuration is
  ignored, and confirm only sanitized examples are tracked.
- Final validation: lint, typecheck, all TypeScript tests, both boundary checks, Next.js build,
  Compose config, Dockerfile check, and `git diff --check`.

## 7. Wrong vs Correct

### Wrong

```yaml
services:
  app: {}
  background-process: {}
```

```ts
import type { SecretCipher } from '../external-runtime/ports/secret-cipher';
```

### Correct

```yaml
services:
  app:
    image: sakurajiamai/hentaiworkers-app:latest
```

```ts
import type { SecretCipher } from '../shared/secret-cipher';
```

## Identity Administration And Registration

- Public registration writes only a pending request, never a user or session; SMTP readiness is checked first.
  `IdentityService.prepareRegistration` returns validated credentials with a password hash and has no write side effects.
  `PendingRegistrationRepository.complete` locks the unexpired email-bound challenge, inserts the ordinary
  active user and deletes the challenge in one transaction. Errors and replay cannot create accounts.
  Verification does not establish a session; the visitor signs in after successful registration.
  Legacy `requireEmailVerification: false` is normalized to true. The public registration entry
  stays unavailable until SMTP host/from-address/enabled are configured.
- Six-digit codes use cryptographic randomness, email-bound SHA-256 storage and 5–10 minute
  expiry. Verify/resend limit both email and IP. Legacy activation tokens accept only inactive
  ordinary users; existing accounts are never overwritten by new requests. Legacy link tokens must match the original
  43-character base64url format, so they cannot bypass code-attempt limits using code hash inputs.
- Initial verification delivery and resends share a normalized-email 120-second cooldown,
  stored in `pending_registrations.sent_at` and reserved under a row lock before SMTP delivery,
  including failed sends. Both code pages read the remaining database cooldown; refreshes, restarts
  and multiple instances cannot reset it. Legacy inactive-account resends retain the process-local limiter.
  SMTP port 465 uses implicit TLS, 587 uses STARTTLS, and custom ports honor the configured mode.
  Log only SMTP diagnostic codes/phase, never credentials, recipients or code contents.
- Role/status changes revoke pending verification tokens in the same transaction. Verification
  runs via a Server Action (POST), never a render-time GET that mutates sessions.
- Admin deletion checks authorization in IdentityService, protects all admin targets, locks the
  ordinary target and cleans personal rows before deleting users within one transaction. Existing
  sessions fail user lookup afterward. No production deletions are performed as part of coding.
