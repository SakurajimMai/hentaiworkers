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
| `SESSION_SECRET` | Required, at least 32 characters and not a placeholder |
| `APP_ENCRYPTION_KEYRING` | JSON keyring of canonical 32-byte Base64 keys |
| `APP_ENCRYPTION_CURRENT_KEY_ID` | Must identify a key in the keyring |

The App must not contain or import a data-acquisition runtime, machine identity/token API,
shared media-output filesystem, or a second Compose service. A root `crawler/` project must
own its dependencies and tests, remain excluded from the App Docker context, TypeScript and
ESLint, and keep production configuration ignored. Catalog media fields contain
browser-accessible URLs.

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

`GET /api/android/update` is a database-free public read from the fixed
`SakurajimMai/hentaiworkers` GitHub Releases source. Include prereleases, but accept only
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

## 4. Validation & Error Matrix

| Condition | Required result |
|-----------|-----------------|
| Forbidden runtime path, npm command, env key, table identifier, or Compose service | `npm run check:boundaries` fails and names the source |
| Missing/invalid App configuration | `AppError('CONFIG_INVALID', ..., 500)` |
| Remote database disables TLS or uses a non-DNS host | Configuration parsing fails |
| Removed route is requested | Normal Next.js 404; no compatibility handler |
| Existing database still contains removed tables | Ignore; do not issue destructive SQL |
| Catalog contains a removed local-media URL | Correct operationally; do not read host files from App |
| GitHub update release is draft, non-main, incomplete, or has an invalid asset path/digest | Ignore it and select the greatest older complete `build-N`; return the documented upstream error only when no cached valid manifest exists |
| `crawler/**/production_config.yml` exists locally | Keep ignored; commit only a sanitized example |

## 5. Good / Base / Bad Cases

- Good: add a catalog query through a port and MariaDB repository, then expose it from an App
  route with contract tests.
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
