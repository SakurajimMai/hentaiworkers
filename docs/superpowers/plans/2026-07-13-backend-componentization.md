# AnimeStream Backend Componentization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 Next.js/MariaDB 后端重构为可测试的模块化控制面，并把 Python 爬虫迁移为通过内部 API 工作、支持后台配置与 S3/SFTP 的独立 Worker。

**Architecture:** 保持 Next.js 模块化单体，`app/**` 仅作为传输适配层，业务进入 `lib/server/{catalog,crawler,identity,operations}`。MariaDB 保存业务与任务控制状态；Python Worker 不持有数据库凭据，通过版本化内部 API、机器令牌和任务租约协作。实施采用兼容门面和加法迁移，最后才删除旧 PyMySQL/YAML 运行时路径。

**Tech Stack:** Next.js 15、TypeScript 5.9、Drizzle ORM、MariaDB 11.4、Zod、iron-session、bcryptjs、Node test runner、Python 3、requests、Selenium、boto3、Paramiko、Docker Compose。

**Workspace constraint:** 当前未提交的 Next.js/MySQL 重构是实施基线。不得创建基于旧 `HEAD` 的隔离 worktree，不得重置用户改动，不自动 commit/push；每个任务以测试结果和 `git diff --check` 作为检查点。

---

## Target File Map

```text
app/
├── api/
│   ├── health/route.ts
│   ├── live/route.ts
│   ├── ready/route.ts
│   └── internal/crawler/v1/**
└── admin/crawler/**

lib/server/
├── shared/
├── catalog/
├── identity/
├── crawler/
├── operations/
├── infrastructure/
└── composition/

crawler_worker/
├── models/
├── transport/
├── runtime/
├── sources/
└── media/

drizzle/
├── baseline/
└── migrations/

tests/
├── contracts/
├── catalog/
├── crawler/
├── identity/
└── integration/
```

## Milestone A: Security and Compatibility Baseline

### Task 1: Eliminate Current npm Vulnerabilities

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: npm audit output and existing test suite

- [x] **Step 1: Capture the failing security baseline**

Run `npm.cmd audit --json`.

Expected before change: 13 vulnerabilities, including high severity `drizzle-orm`, `flatted`, `minimatch`, `picomatch`, and `ws` findings.

- [x] **Step 2: Apply compatible direct dependency floors**

Set only these floors and overrides; keep unrelated ranges unchanged:

```json
{
  "dependencies": {
    "drizzle-orm": "^0.45.2",
    "next": "^15.5.20"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.10",
    "eslint-config-next": "^15.5.20",
    "postcss": "^8.5.18"
  },
  "overrides": {
    "postcss": "$postcss",
    "@esbuild-kit/core-utils": {
      "esbuild": "^0.25.12"
    }
  }
}
```

- [x] **Step 3: Refresh compatible transitive versions**

Run `npm.cmd install` followed by `npm.cmd audit fix`. Do not use `--force`.

- [x] **Step 4: Verify security and compatibility**

Run:

```powershell
npm.cmd audit --json
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Expected: zero audit findings and all commands exit 0.

- [x] **Step 5: Record the checkpoint**

Run `git diff --check -- package.json package-lock.json`; expect no whitespace errors.

### Task 2: Freeze the Production MariaDB Baseline

**Files:**
- Modify: `.env.example`
- Create: `scripts/export-schema-baseline.mjs`
- Create: `drizzle/baseline/0000-production-schema.sql`
- Create: `tests/schema-baseline.test.ts`
- Modify: `package.json`
- Modify: `drizzle.config.ts`

- [x] **Step 1: Write a failing baseline guard test**

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('生产基线包含现有核心表和约束', () => {
  const sql = readFileSync('drizzle/baseline/0000-production-schema.sql', 'utf8');
  for (const table of ['animes', 'tags', 'anime_tags', 'categories', 'users']) {
    assert.match(sql, new RegExp(`CREATE TABLE .*${table}`, 'i'));
  }
  assert.match(sql, /UNIQUE[^;]+anime_id[^;]+tag_id/is);
  assert.match(sql, /FOREIGN KEY/is);
});
```

- [x] **Step 2: Confirm the test fails**

Run `npx.cmd tsx --test tests/schema-baseline.test.ts`.

Expected: FAIL because the baseline file does not exist.

- [x] **Step 3: Implement the read-only exporter**

The exporter must load `.env` without printing credentials, query `SHOW CREATE TABLE` for the five known tables, write deterministic UTF-8 SQL with no data, and normalize `AUTO_INCREMENT=<number>`.

Add scripts:

```json
{
  "db:baseline": "node scripts/export-schema-baseline.mjs",
  "db:push": "node -e \"throw new Error('db:push is disabled; use reviewed migrations')\""
}
```

- [x] **Step 4: Export and verify**

Run:

```powershell
npm.cmd run db:baseline
npx.cmd tsx --test tests/schema-baseline.test.ts
```

Expected: exporter reports table names only and the test passes.

- [x] **Step 5: Make migration output explicit**

Change `drizzle.config.ts` output to `./drizzle/migrations`. Do not apply schema changes to production.

Implementation checkpoint: the initial read-only baseline was captured before the TLS gate was added. The exporter now requires verified TLS for remote DNS hosts and will not reconnect to the current production endpoint until a valid certificate/CA path or controlled local tunnel is configured.

### Task 3: Lock Public API Compatibility with Golden Contracts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/public-api-types.ts`
- Modify: `app/api/animes/route.ts`
- Create: `app/api/animes/handler.ts`
- Modify: `app/api/animes/[id]/route.ts`
- Create: `app/api/animes/[id]/handler.ts`
- Modify: `app/api/animes/[id]/similar/route.ts`
- Create: `app/api/animes/[id]/similar/handler.ts`
- Modify: `app/api/tags/route.ts`
- Create: `app/api/tags/handler.ts`
- Modify: `app/api/health/route.ts`
- Create: `app/api/health/handler.ts`
- Create: `tests/contracts/public-api-contract.test.ts`
- Create: `tests/contracts/fixtures/animes-list.json`
- Create: `tests/contracts/fixtures/anime-detail.json`
- Create: `tests/contracts/fixtures/similar.json`
- Create: `tests/contracts/fixtures/tags.json`
- Create: `tests/contracts/fixtures/health.json`
- Modify: `docs/api/openapi.yaml`

- [x] **Step 1: Add synthetic golden fixtures**

List fixture:

```json
{
  "data": [{ "id": 1, "title": "Fixture", "cover": null, "viewCount": 0, "titleEnglish": null }],
  "pagination": { "page": 1, "limit": 48, "total": 1, "totalPages": 1 }
}
```

Detail fixtures include all current anime keys and `tags`; similar fixtures include `id`, `title`, `cover`, `fanart`, and `viewCount`.

- [x] **Step 2: Write contract assertions**

Verify valid, invalid, not-found, and internal-error statuses; required key presence with null values; `{ error: string }`; and `/api/health` compatibility.

- [x] **Step 3: Confirm contract tests fail before adapters are injectable**

Run `npx.cmd tsx --test tests/contracts/public-api-contract.test.ts`; expect at least one failing assertion.

- [x] **Step 4: Correct OpenAPI required fields without changing JSON**

Mark current list, detail, similar, tag, pagination, health, and error fields as required where runtime always emits them.

- [x] **Step 5: Verify compatibility**

Run `npm.cmd test` and the focused contract test; expect all pass.

## Milestone B: Modular Next.js Backend

### Task 4: Create Shared Server Primitives and Lazy Composition

**Files:**
- Create: `lib/server/shared/errors.ts`
- Create: `lib/server/shared/result.ts`
- Create: `lib/server/shared/clock.ts`
- Create: `lib/server/shared/logger.ts`
- Create: `lib/server/shared/config.ts`
- Create: `lib/server/composition/container.ts`
- Test: `tests/server/shared.test.ts`

- [x] **Step 1: Write failing shared primitive tests**

Cover stable error codes, redaction, validated environment parsing, and lazy composition that does not connect to MariaDB at module import.

```ts
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

- [x] **Step 2: Confirm missing-module failures**

Run `npx.cmd tsx --test tests/server/shared.test.ts`.

- [x] **Step 3: Implement minimal primitives**

Validate `DATABASE_URL`, `SESSION_SECRET`, database TLS/pool settings, `APP_ENCRYPTION_KEYRING`, and current key ID with Zod. Expose service getters rather than eager instances.

- [x] **Step 4: Verify shared primitives**

Run focused tests, TypeScript, and build.

Security follow-up (independent review) completed in-session:
embedded URL query redaction, immutable keyring accessors, weak SESSION_SECRET / zero-key rejection, container logger secret wiring, non-throwing logger write path.

### Task 5: Extract the Catalog Component Behind Compatibility Facades

**Files:**
- Create: `lib/server/catalog/domain/models.ts`
- Create: `lib/server/catalog/domain/recommendation.ts`
- Create: `lib/server/catalog/ports/catalog-read-repository.ts`
- Create: `lib/server/catalog/ports/catalog-write-repository.ts`
- Create: `lib/server/catalog/application/catalog-query-service.ts`
- Create: `lib/server/catalog/application/catalog-command-service.ts`
- Create: `lib/server/infrastructure/database/mariadb-catalog-repository.ts`
- Modify: `lib/anime-service.ts`
- Test: `tests/catalog/catalog-query-service.test.ts`
- Test: `tests/catalog/catalog-compatibility.test.ts`

- [x] **Step 1: Write repository-fake tests**

Verify active-null compatibility, paging caps, sort behavior, series-prefix recommendations, tag fallback, sitemap limits, and no Drizzle imports in application/domain files.

```ts
export interface CatalogReadRepository {
  list(input: CatalogListQuery): Promise<CatalogPage>;
  getById(id: number): Promise<AnimeDetail | null>;
  listTags(): Promise<ReadonlyArray<TagSummary>>;
  getSitemapData(): Promise<SitemapData>;
}
```

- [x] **Step 2: Confirm tests fail before implementation**

Run catalog tests; expect missing module failures.

- [x] **Step 3: Implement services and MariaDB adapter**

Keep pure prefix/escaping rules in domain code and all Drizzle expressions/retries in the adapter.

- [x] **Step 4: Convert `lib/anime-service.ts` into a facade**

Keep exported names and return types, delegating to the composition root.

- [x] **Step 5: Run differential tests**

Facade and direct service results must be deeply equal for the same fixture.

### Task 6: Extract Identity and Transactional Admin Services

**Files:**
- Create: `lib/server/identity/session-config.ts`
- Create: `lib/server/identity/ports/session.ts`
- Create: `lib/server/identity/ports/user-repository.ts`
- Create: `lib/server/identity/application/identity-service.ts`
- Create: `lib/server/infrastructure/auth/iron-session-adapter.ts`
- Create: `lib/server/infrastructure/auth/bcrypt-password-hasher.ts`
- Create: `lib/server/catalog/application/admin-catalog-service.ts`
- Modify: `lib/auth.ts`
- Modify: `middleware.ts`
- Split: `app/admin/actions.ts` into focused action adapters
- Modify: `app/admin/**/*.tsx`
- Test: `tests/identity/identity-service.test.ts`
- Test: `tests/catalog/admin-catalog-service.test.ts`

- [x] **Step 1: Write failing auth and transaction tests**

Verify disabled admins are rejected, middleware and server share cookie options, password changes require the current password, save/delete/import operations roll back together, and inserted IDs come from database results rather than title re-query.

- [x] **Step 2: Implement shared session configuration**

Expose one serializable config factory used by middleware and Node adapters. Middleware performs only coarse cookie-role checks; pages/actions call `IdentityService.requireAdmin()` for live database validation.

- [x] **Step 3: Implement transactional admin services**

All anime/tag relation changes use a MariaDB transaction. Batch import processes each anime in an explicit transaction and returns structured created/updated/skipped/error counts.

- [x] **Step 4: Make Server Actions thin adapters**

Each action parses FormData with Zod, calls one application use case, maps `AppError` to existing redirects, revalidates paths, and redirects. Remove direct database/schema imports from `app/admin/**`.

- [x] **Step 5: Verify identity/admin behavior**

Run focused tests, full tests, lint, TypeScript, and build.

## Milestone C: Crawler Control Plane

### Task 7: Add Additive Control-Plane Schema and Migration

**Files:**
- Create: `lib/server/crawler/domain/job.ts`
- Create: `lib/server/crawler/domain/schedule.ts`
- Create: `lib/server/crawler/domain/config.ts`
- Create: `lib/server/infrastructure/database/schema/crawler.ts`
- Create: `drizzle/migrations/0001-crawler-control.sql`
- Test: `tests/crawler/job-state.test.ts`
- Test: `tests/integration/crawler-migration.test.ts`

- [x] **Step 1: Write state-machine tests first**

Cover queued cancellation, leased/running cancellation, retry wait, lease expiry, partial success, terminal immutability, cancel/complete race, and manual retry creating a new linked job.

```ts
export type CrawlerJobStatus =
  | 'queued'
  | 'leased'
  | 'running'
  | 'retry_wait'
  | 'cancel_requested'
  | 'succeeded'
  | 'partial_succeeded'
  | 'failed'
  | 'cancelled';
```

- [x] **Step 2: Write migration assertions**

Verify every new table, binary hash, UTC timestamp, unique constraint, foreign key, `JSON_VALID` check, and no ALTER/DROP against existing catalog tables.

- [x] **Step 3: Implement domain rules and explicit SQL**

Add profiles/versions, storage profiles/versions, secrets/versions, schedules, jobs/attempts/items/events, operation receipts, media upload reservations, workers/credentials, audit, anime sources, and media assets.

- [x] **Step 4: Apply only to disposable MariaDB 11.4**

Run the migration test against a temporary database. Do not apply to production in this task.
(Static migration gates always run; live apply is opt-in via `CRAWLER_MIGRATION_DATABASE_URL` and refuses non-disposable hosts.)

### Task 8: Implement Config, Secrets, Storage Profiles, and YAML Import

**Files:**
- Create: `lib/server/crawler/application/crawler-config-service.ts`
- Create: `lib/server/crawler/application/storage-config-service.ts`
- Create: `lib/server/crawler/application/secret-service.ts`
- Create: `lib/server/crawler/application/yaml-import-service.ts`
- Create: `lib/server/crawler/ports/secret-cipher.ts`
- Create: `lib/server/infrastructure/crypto/aes-gcm-secret-cipher.ts`
- Test: `tests/crawler/config-service.test.ts`
- Test: `tests/crawler/yaml-import.test.ts`
- Test: `tests/crawler/secret-service.test.ts`

- [x] **Step 1: Write failing config and security tests**

Cover version immutability, S3/SFTP unions, direct-eye reveal with no-store metadata, keyring rotation, nonce/AAD validation, revoked secret rejection, YAML limits, D1/database deprecation, `organize_by_date`, and duplicate concurrency-field warning.

- [x] **Step 2: Define versioned Zod schemas**

```ts
const storageConfigSchema = z.discriminatedUnion('driver', [
  z.object({
    driver: z.literal('s3'),
    endpoint: z.string().url(),
    region: z.string().min(1),
    bucket: z.string().min(1),
    prefix: z.string(),
    deliveryMode: z.enum(['public', 'cdn', 'private']),
    publicBaseUrl: z.string().url().optional(),
    forcePathStyle: z.boolean().default(false),
  }),
  z.object({
    driver: z.literal('sftp'),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    username: z.string().min(1),
    rootPath: z.string().min(1),
    hostKeyFingerprint: z.string().min(16),
    publicBaseUrl: z.string().url().optional(),
  }),
]);
```

- [x] **Step 3: Implement AES-GCM keyring and audit hooks**

Use random 96-bit nonces, AAD `secretId:version:scope`, current write key ID, historical decrypt keys, and constant-time token/hash comparisons.

- [x] **Step 4: Implement YAML preview/import**

Preview returns `mapped`, `converted`, `deprecated`, `missing`, and `invalid`. Import cannot activate storage until a Worker storage-test task succeeds.

- [x] **Step 5: Verify no plaintext leakage**

Focused tests and serialized DTO inspection must show plaintext only in explicit reveal results.

### Task 9: Implement Scheduling, Leasing, Idempotency, and Cleanup

**Files:**
- Create: `lib/server/crawler/application/crawler-schedule-service.ts`
- Create: `lib/server/crawler/application/crawler-job-service.ts`
- Create: `lib/server/crawler/application/crawler-result-service.ts`
- Create: `lib/server/crawler/application/crawler-log-service.ts`
- Create: `lib/server/crawler/application/media-reservation-service.ts`
- Create: `lib/server/crawler/ports/crawler-unit-of-work.ts`
- Test: `tests/crawler/schedule-service.test.ts`
- Test: `tests/crawler/job-service.test.ts`
- Test: `tests/crawler/idempotency.test.ts`

- [x] **Step 1: Write failing scheduler tests**

Cover five-field Cron, IANA timezone, DST behavior, latest-only/skip/catch-up misfires, catch-up cap 3, template concurrency cap, and overdue display without Worker.

- [x] **Step 2: Write failing lease and receipt tests**

Cover concurrent claim, attempt creation, hashed lease binding, late submission rejection, same key/same hash replay, same key/different hash conflict, and receipts for item/complete/fail.

- [x] **Step 3: Implement compare-and-set services**

Use status predicates and affected-row checks. Materialize due schedule points in the claim transaction. Never retry a non-idempotent transaction without a receipt key.

- [x] **Step 4: Implement media reservation and reconciliation**

Reserve deterministic staging/final keys before upload, persist job/attempt/item ownership, and discover expired reservations and orphaned final objects.

- [x] **Step 5: Verify MariaDB concurrency**

Run 20 simultaneous claim requests against a disposable database; expect one lease per job and no duplicate schedule occurrence.

### Task 10: Add Versioned Worker API and Auth Guards

**Files:**
- Create: `app/api/internal/crawler/v1/workers/register/route.ts`
- Create: `app/api/internal/crawler/v1/workers/[workerId]/heartbeat/route.ts`
- Create: `app/api/internal/crawler/v1/jobs/claim/route.ts`
- Create: task route handlers for start, heartbeat, events, media reserve, credential refresh, item commit, complete, and fail
- Create: `lib/server/crawler/interfaces/worker-auth.ts`
- Create: `lib/server/crawler/interfaces/worker-presenter.ts`
- Test: `tests/contracts/worker-api-contract.test.ts`

- [x] **Step 1: Write API contract failures first**

Cover 401 invalid/revoked tokens, 403 scope/worker mismatch, capability mismatch, request limits, lease loss, credential refresh, batch idempotency, and stable errors.

- [x] **Step 2: Implement thin route adapters**

Each route validates with Zod, authenticates the Worker, invokes one application service, and maps `AppError` through one presenter. Route files contain no Drizzle imports.

- [x] **Step 3: Add protocol negotiation**

Registration includes protocol version, capabilities, browser version, and schema versions. Unsupported jobs remain queued with a visible reason.

- [x] **Step 4: Verify contracts and ingress assumptions**

Contract tests must pass, public ingress must return 404 for internal paths, and Compose service DNS must remain reachable.

### Task 11: Build the Visual Crawler Admin

**Files:**
- Create: `app/admin/crawler/page.tsx`
- Create: profile, schedule, job, storage, Worker, import, and audit pages under `app/admin/crawler/**`
- Create: focused Server Actions under `app/admin/crawler/actions/**`
- Create: UI components under `components/admin/crawler/**`
- Test: `tests/crawler/admin-actions.test.ts`

- [x] **Step 1: Write Server Action tests**

Verify admin authorization, Zod validation, version creation, manual start, schedule save, cancel/retry, secret reveal, YAML import confirmation, and storage-test task creation.

- [x] **Step 2: Implement dashboard and list pages**

Show Worker online state, current jobs, success/partial/failure counts, overdue schedules, and recent errors. Pages call application queries, never `db` directly.

- [x] **Step 3: Implement typed configuration editors**

Render source, date filter, search, quality, skip keywords, download, proxy, Selenium, strategy, Getchu, logging, performance, schedule, and storage groups from field metadata.

- [x] **Step 4: Implement direct-eye secret controls**

The eye calls a no-store admin endpoint and reveals the value without re-authentication. Auto-hide after 30 seconds and emit an audit event. Do not add password confirmation.

- [x] **Step 5: Implement history/log views**

Job detail shows immutable snapshots, attempts, items, progress, redacted events, media reservations, errors, cancellation, and new-job retry actions.

- [x] **Step 6: Verify admin behavior**

Run focused tests, lint, TypeScript, build, and browser smoke tests.

## Milestone D: Independent Worker and Cutover

### Task 12: Create the Database-Free Worker Runtime

**Files:**
- Create: `crawler_worker/models/config.py`
- Create: `crawler_worker/models/api.py`
- Create: `crawler_worker/transport/control_client.py`
- Create: `crawler_worker/runtime/runner.py`
- Create: `crawler_worker/runtime/heartbeat.py`
- Create: `crawler_worker/sources/hanime.py`
- Create: `crawler_worker/sources/getchu.py`
- Create: `crawler_worker/main.py`
- Test: `crawler_worker/tests/test_control_client.py`
- Test: `crawler_worker/tests/test_runner.py`

- [x] **Step 1: Write failing Python tests**

Use fake HTTP responses for register, idle heartbeat, long-poll claim, job heartbeat, cancel, lease loss, log batching, credential refresh, idempotent commits, and bounded spool behavior.

- [x] **Step 2: Define DTOs without database concepts**

Models may contain job, source, storage, media, event, and result DTOs. They must not contain database host/user/password/table fields.

- [x] **Step 3: Port source behavior behind adapters**

Move parsing, quality selection, skip keywords, date filters, Getchu enrichment, timeout, proxy, retry, and delay behavior out of `scripts/unified_crawler.py`. Source adapters return DTOs and never call PyMySQL.

- [x] **Step 4: Implement cooperative runtime**

Maintain Worker heartbeats while idle, task heartbeats while running, stop on cancel/lease loss, batch at most 100 events/256 KiB, and clean the task temp directory.

- [x] **Step 5: Verify no database dependency**

Run:

```powershell
rg -n "pymysql|MYSQL_|DATABASE_URL|INSERT INTO|UPDATE .*animes" crawler_worker
```

Expected: no matches.

### Task 13: Implement S3/SFTP Media Adapters

**Files:**
- Create: `crawler_worker/media/base.py`
- Create: `crawler_worker/media/s3.py`
- Create: `crawler_worker/media/sftp.py`
- Create: `crawler_worker/media/paths.py`
- Create: `crawler_worker/tests/test_s3.py`
- Create: `crawler_worker/tests/test_sftp.py`
- Create: `crawler_worker/tests/test_paths.py`

- [x] **Step 1: Write adapter contract tests**

Cover reserved staging/final keys, SHA-256, S3 temporary credentials, refresh, SFTP host-key verification, atomic rename, cleanup, delivery modes, and rejection of SFTP playback without public mapping.

- [x] **Step 2: Implement S3 adapter**

Use boto3 with TLS verification, scoped credentials, multipart support, staging upload, controlled publish, head verification, and cleanup.

- [x] **Step 3: Implement SFTP adapter**

Use Paramiko with mandatory fingerprint, dedicated root path, staging upload, fsync where supported, same-filesystem rename, and cleanup. Never auto-accept unknown keys.

- [x] **Step 4: Run storage integration tests**

Use MinIO and an ephemeral SFTP service; upload, verify, publish, and delete must pass for both.

### Task 14: Build and Harden the Worker Container

**Files:**
- Create: `Dockerfile.worker`
- Create: `requirements-worker.in`
- Create: `requirements-worker.lock`
- Modify: `docker-compose.yml`
- Modify: `.dockerignore`
- Test: container smoke commands

- [x] **Step 1: Lock Worker dependencies**

Include requests, PyYAML, cloudscraper, BeautifulSoup, lxml, Selenium, boto3, and Paramiko with hashes. Exclude PyMySQL.

- [x] **Step 2: Create a hardened image**

Pin Python and compatible Chromium/Driver packages. Use non-root UID, read-only root support, no-new-privileges, dropped capabilities, browser sandbox, and a dedicated temp volume.

- [x] **Step 3: Add Worker to Compose**

Worker receives only internal URL, Worker ID, and Worker token. Add CPU, memory, PID, temp-space, restart, and dependency health limits. Expose no host port.

- [x] **Step 4: Add health endpoints compatibly**

Create `/api/live` and `/api/ready`, preserve `/api/health`, and switch Docker app healthcheck only after all three tests pass.

- [x] **Step 5: Verify images and boundaries**

Build images, verify Worker is non-root with no database env, verify ingress blocks internal paths, and run a storage-test job.

### Task 15: End-to-End Verification and Legacy Cutover

**Files:**
- Create: `tests/integration/crawler-e2e.test.ts`
- Create: `docs/api/crawler-internal-openapi.yaml`
- Modify: `docs/architecture.md`
- Modify: `docs/deployment.md`
- Modify: `docs/development.md`
- Modify: `README.md`
- Delete after acceptance: `scripts/crawler_config.py`
- Delete after acceptance: direct-DB portions of `scripts/unified_crawler.py`
- Delete after acceptance: `scripts/production_crawler.py`
- Delete after acceptance: runtime use of `scripts/production_config.yml`

- [x] **Step 1: Run the full test environment**

Start disposable MariaDB 11.4, MinIO, SFTP, app, and Worker. Import synthetic YAML and run storage tests.

- [x] **Step 2: Run a synthetic crawl end to end**

Verify manual/scheduled jobs, ingestion, media publishing, API visibility, progress/log history, direct-eye reveal, cancel, retry, Worker crash recovery, and app restart recovery.

- [x] **Step 3: Run fault and compatibility tests**

Inject duplicate commits, same-key/different-payload conflicts, expired leases, expired S3 credentials, revoked Worker token, MariaDB disconnect, upload failure, ingress access, and N/N-1 protocol combinations.

- [x] **Step 4: Run shadow comparison**

Run legacy and new parsing against identical saved HTML fixtures with writes disabled. Compare DTOs, media choice, tags, dates, and skip decisions.

- [x] **Step 5: Cut over without restoring direct writes**

Enable new jobs, observe results, revoke the old crawler database account, then remove PyMySQL/YAML runtime code. Rollback pauses new crawling while preserving data; it never restores direct database writes.

- [x] **Step 6: Run the final release gate**

```powershell
npm.cmd audit --json
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run check:legacy
npm.cmd run build
git diff --check
```

Also run all Python Worker tests and Docker end-to-end checks. Expected: zero vulnerabilities, zero test failures, successful build, no legacy DB/D1 paths, and no whitespace errors.

## Plan Self-Review

- Every design section maps to at least one task.
- Security baseline precedes dependency-heavy implementation.
- Public API and MariaDB behavior are frozen before refactoring.
- Catalog and Identity migrate behind compatibility facades before crawler work.
- Control-plane schema is additive and tested against MariaDB 11.4.
- Worker API, admin UI, Worker runtime, storage adapters, and deployment are separately testable.
- Old direct database code is deleted only after shadow comparison and successful cutover.
- No production migration, commit, or push occurs without explicit operator action.
