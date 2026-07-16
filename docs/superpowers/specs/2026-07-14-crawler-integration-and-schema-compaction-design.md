# Crawler Integration And Schema Compaction Design

## Objective

Make the crawler usable end to end while reducing the default crawler control-plane schema from nineteen tables to nine core tables. Existing databases remain readable during migration, and destructive cleanup requires an explicit operator confirmation.

## Core Schema

The default external-URL crawler requires these tables:

1. `crawler_profiles`: named validated crawler configuration and current JSON snapshot.
2. `crawler_schedules`: optional schedule and copied configuration snapshot.
3. `crawler_jobs`: queue, lease, retry, and terminal state.
4. `crawler_job_attempts`: lease-token hashes and retry-attempt history.
5. `crawler_job_items`: per-source result and linked Catalog ID.
6. `crawler_job_events`: bounded structured task log.
7. `crawler_operation_receipts`: concurrency-safe idempotency responses.
8. `crawler_workers`: worker identity, one active hashed token, scopes, capabilities, and heartbeat.
9. `anime_sources`: stable `(source, source_id) -> anime_id` mapping.

Separate profile-version, schedule-skip, upload-reservation, worker-credential, storage-profile, secret-version, generic audit, and media-asset tables are not required by external-URL ingestion. Attempts and operation receipts remain separate because collapsing them would weaken lease retry and concurrent idempotency guarantees. Existing deployments can retain them while migrating; the compaction command only drops them after checking that the core rows are migrated and the operator passes an explicit confirmation flag.

## Runtime Flow

1. An administrator creates a crawler profile and starts a job from that saved profile. Server code loads the saved snapshot; the browser never supplies an authoritative snapshot.
2. An administrator provisions a Worker. The plaintext token is returned once; only its SHA-256 digest is stored.
3. The Worker claims a job through the versioned internal API. Job claim and lease mutation execute on one MariaDB transaction connection.
4. The source adapter fetches the configured source with bounded timeouts, a fixed user agent, redirect validation, and response-size limits. It parses list and detail pages into normalized item DTOs.
5. The Worker submits title, external video URL, cover, fanart, description, release metadata, and tags with the item result.
6. The control plane validates the lease and payload, then atomically upserts `animes`, `tags`, `anime_tags`, `anime_sources`, and `crawler_job_items`. Replays return the original result; a reused key with a changed payload returns conflict.
7. The Worker completes the job with succeeded and failed counts. The task log and catalog linkage remain visible in the admin UI.

## Compatibility And Safety

- Existing public API responses and site/mobile consumers are unchanged.
- The Worker API only adds optional item fields, so older Workers still report failures/skips; a successful item without required catalog metadata is rejected.
- Internal API remains protected by machine tokens and should remain blocked from public ingress.
- No migration command connects to a non-local database without the existing confirmation gate.
- Schema compaction has a separate `--dry-run` audit mode and refuses to drop non-empty tables unless every relevant row has a core-table representation.
- S3/SFTP code remains available as an optional extension, but external URL crawling does not require its tables or credentials.

## Verification

- Unit tests cover transaction connection binding, item DTO validation, catalog upsert/replay, source parsing, and Worker token lifecycle.
- Integration tests cover admin provision -> claim -> parse -> item commit -> catalog mapping -> complete.
- Migration tests assert nine core tables and verify that cleanup is opt-in.
- Full TypeScript tests, Python tests, lint, type check, and production build are required before completion.
