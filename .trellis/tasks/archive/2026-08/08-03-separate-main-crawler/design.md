# Technical Design

## 1. Target Repository

The repository becomes an App-only codebase for this task:

```text
repository/
├── app/                 # site, admin, public/user APIs
├── components/
├── lib/                 # catalog, identity, system, shared infrastructure
├── drizzle/             # main-site baseline and retained app migrations
├── scripts/             # main-site database/admin/quality scripts
├── tests/               # TypeScript main-site tests
├── mobile/              # existing API client project
├── deploy/              # App-only deployment bundle
└── Dockerfile           # App image
```

There is no `crawler/` package, Worker process, crawler control plane, or crawler deployment artifact. A future crawler is a separate future design, not a compatibility constraint for this change.

## 2. Removal Boundary

Delete these complete runtime surfaces:

- `crawler/**` and any root Worker wrappers/examples;
- `app/admin/crawler/**` and `components/admin/crawler/**`;
- `app/api/internal/crawler/**`;
- `lib/server/crawler/**`;
- crawler-specific database repositories and schema modules;
- crawler-control tests and internal crawler OpenAPI;
- crawler-control migration/core SQL and operational scripts;
- Worker image build/publish and Compose services.

Remove crawler links and copy from the remaining admin UI.

## 3. Main-Site Utility Extraction

System settings currently import `SecretCipher` and SHA-256 helpers from the crawler domain. Move those contracts/functions to `lib/server/shared/` and update App infrastructure and tests before deleting `lib/server/crawler/`.

This is a namespace correction only. Ciphertext format, AAD strings, keyring behavior, password reset hashes, SMTP secrets, and Turnstile secrets remain compatible.

## 4. Media Boundary

Delete `/api/media/covers/**`, `lib/server/media/local-cover-*`, `CRAWLER_COVER_DIR`, App cover volume mounts, and storage initialization used only for shared crawler output.

The App continues to render URLs stored in `animes.cover`, `animes.fanart`, and `animes.video_url`. Existing absolute URLs remain valid. Old relative `/api/media/covers/**` rows become unresolved and must be corrected operationally before removing production files; this task does not mutate catalog data automatically.

## 5. Database And Migrations

- Remove root crawler core SQL and pure crawler-control migrations (`0001`, `0002`, `0005`, `0014`-`0017`).
- Remove crawler schema declarations and verification tests.
- Remove crawler-named setup/migrate commands. Keep schema application in the existing
  reviewed SQL process; do not add another runtime migration framework during deletion.
- Fresh App setup uses the existing main baseline and retained application migrations.
- Preserve `0010`-`0013` exactly as historical works migrations per repository policy.
- Existing migration ledger entries and existing crawler tables in deployed databases are ignored, not altered or dropped.

This leaves rollback possible: restoring old code can still use existing tables, and no database rollback is required by the removal commit.

## 6. Testing And Boundary Enforcement

Root `npm test` runs TypeScript tests only through deterministic file discovery. Remove tests whose subject is the deleted crawler/control/local-cover code.

A root boundary check rejects:

- forbidden crawler/control directories;
- root Worker/Python runtime files;
- crawler npm commands and environment variables;
- crawler-control table identifiers in active App source/schema/scripts;
- Worker services/images in App deployment files;
- App source and deployment references to deleted crawler APIs and operations.

Historical Trellis task records and Git history are not application runtime inputs and are excluded from the boundary scan.

## 7. Deployment And CI

Root and `deploy/` Compose contain only `app`. Remove Worker env examples, temp/cover volumes, storage initializer, and App dependencies on those services.

The Docker publishing workflow publishes only the App image. App `.dockerignore` no longer needs crawler-secret/runtime patterns except generally applicable secret exclusions.

## 8. Compatibility And Rollback

- Public catalog, authentication, user lists/progress, system settings, and manual anime administration remain unchanged.
- Removed crawler/admin/API URLs return normal Next.js 404 responses.
- No database tables are dropped and no stored catalog rows are rewritten.
- Rollback consists of restoring deleted code/config; database state is intentionally left compatible with that rollback.
