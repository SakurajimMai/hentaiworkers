# Current Coupling Audit

## Scope And Evidence

The audit was performed against the dirty working tree on 2026-08-03. Existing uncommitted changes are treated as the implementation baseline and must not be reverted.

## Current Main-Site Coupling

### Web and application code

- `app/admin/crawler/**` contains the crawler dashboard, profiles, jobs, schedules, workers, storage, secrets, audit, and YAML import surfaces.
- `components/admin/crawler/**` contains UI used only by those routes.
- `app/api/internal/crawler/v1/**` exposes the old Worker registration, claim, lease, heartbeat, item commit, media reservation, and completion API.
- `lib/server/crawler/**` contains the corresponding control-plane domain, application, interfaces, ports, and test doubles.
- `lib/server/infrastructure/database/mariadb-crawler-*.ts` and `lib/server/infrastructure/database/schema/crawler.ts` implement and declare control-plane persistence.
- The main admin navigation and dashboard still link to `/admin/crawler`.

### Accidental shared utilities

- Main-site system settings import `SecretCipher` and SHA-256 helpers from `lib/server/crawler/**`.
- `AesGcmSecretCipher` also implements the crawler-owned port.
- These are generic application utilities and must move to `lib/server/shared/**` before the crawler tree is deleted.

### Database and operations

- Root `drizzle/core/0001-crawler-core.sql` creates eight pure control-plane tables plus `anime_sources`.
- Root migrations `0001`, `0002`, `0005`, and `0014`-`0017` are crawler-control migrations.
- Root scripts apply/compact crawler schema, enqueue/reap/fail jobs, provision Worker identities, and delegate to crawler startup/tests.
- Root `package.json` makes the main test lifecycle invoke Python tests and exposes Worker commands.
- Existing databases may contain these historical tables. Removing runtime ownership does not require destructive table deletion.

### Filesystem and deployment

- `app/api/media/covers/**` and `lib/server/media/local-cover-*` make the App serve files written by the crawler.
- Root and deploy Compose files jointly run App, Worker, and a shared-volume initializer.
- App receives `CRAWLER_COVER_DIR` and mounts the same `covers` directory as the Worker.
- One GitHub workflow builds and publishes both images as a single job.
- Root/deploy Worker environment examples and deployment docs require both programs to be present together.

## Current Crawler Coupling

- The new `crawler_worker.main` and `standalone_runner` use direct MySQL, but the package still ships the old `transport/control_client.py`.
- `runtime/runner.py`, `runtime/heartbeat.py`, `models/config.py`, and most DTOs in `models/api.py` exist solely for the main-site control plane.
- `media/upload_pipeline.py` mixes reusable download/storage helpers with control-plane media reservations and completion calls.
- Tests still exercise Worker tokens, claims, leases, heartbeat, `/api/internal/crawler/v1`, and the old config API.
- Local-cover fallback produces a main-site `/api/media/covers/**` URL and therefore requires a shared filesystem. In standalone flow this branch cannot produce a playable catalog item without a video and is unnecessary once all media publishing uses S3/SFTP.

## Shared Data Contract

The crawler directly reads/writes these catalog tables:

- Main-site catalog tables: `animes`, `categories`, `tags`, `anime_tags`.
- Crawler-owned idempotency mapping: `anime_sources`.

The main site does not need to query `anime_sources`. The intended integration is database rows containing public S3/SFTP URLs, not shared source code, HTTP calls, tokens, job tables, or local files.

The crawler should validate required columns/indexes before crawling and provide its own idempotent `anime_sources` schema setup under `crawler/`. Main-site migrations must not create crawler-control tables.

## Test Baseline

- `npm run lint`: passes.
- `npm run test:ts`: current quoted glob is not resolved by the installed Node/tsx combination (`Could not find tests/**/*.test.ts`), so the main test launcher needs a deterministic file enumerator.
- `crawler/scripts/test.sh`: fails in the current system Python because old control-plane tests remain and the isolated Python dependencies are not installed. The lock file includes the required dependencies; the runner should prefer `crawler/.venv` and the obsolete tests/modules must be removed.

## Superseding Scope Decision

After this audit, the user changed the target from two peer projects to removing the current crawler completely. The coupling inventory above remains the deletion inventory, but no crawler package, schema setup, Docker artifact, or standalone test suite will remain after this task. Replacement crawler design is deferred.

## Superseded Two-Project Boundary

The following table records the earlier option for traceability and is not the active target:

| Concern | Main site (repository root) | Crawler (`crawler/`) |
|---|---|---|
| Runtime | Next.js site/admin/public API | Python Hanime crawl process |
| Dependencies | npm lockfile only | Python requirements only |
| Database access | Site/user/admin tables | Direct catalog writes + `anime_sources` |
| Media | Reads public URLs stored in DB | Downloads and publishes to S3/SFTP |
| Configuration | `.env` with App/DB/session settings | Own config and env files |
| Tests | TypeScript tests only | Python tests only |
| Container | App-only Dockerfile/Compose | Crawler-only Dockerfile/Compose |
| Forbidden integration | Crawler UI/API/token/job/local-cover plumbing | App URL/control client/Worker lease protocol |
