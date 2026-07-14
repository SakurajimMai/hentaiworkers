import {
  bigint,
  binary,
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varbinary,
  varchar,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

/** Prefer UTC via connection timezone (mysql2 `timezone: 'Z'`) + CURRENT_TIMESTAMP. */
const utcNow = sql`CURRENT_TIMESTAMP`;

export const crawlerProfiles = mysqlTable('crawler_profiles', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  isEnabled: tinyint('is_enabled').notNull().default(1),
  currentVersionId: bigint('current_version_id', { mode: 'number', unsigned: true }),
  createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
  updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
});

export const crawlerProfileVersions = mysqlTable(
  'crawler_profile_versions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    profileId: bigint('profile_id', { mode: 'number', unsigned: true }).notNull(),
    version: int('version', { unsigned: true }).notNull(),
    schemaVersion: int('schema_version', { unsigned: true }).notNull().default(1),
    configJson: text('config_json').notNull(),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    createdByUserId: bigint('created_by_user_id', { mode: 'number', unsigned: true }),
  },
  (t) => [
    uniqueIndex('crawler_profile_versions_profile_version_uidx').on(t.profileId, t.version),
    index('crawler_profile_versions_profile_id_idx').on(t.profileId),
  ],
);

export const storageProfiles = mysqlTable('storage_profiles', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  driver: mysqlEnum('driver', ['s3', 'sftp']).notNull(),
  isEnabled: tinyint('is_enabled').notNull().default(1),
  currentVersionId: bigint('current_version_id', { mode: 'number', unsigned: true }),
  createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
  updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
});

export const storageProfileVersions = mysqlTable(
  'storage_profile_versions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    profileId: bigint('profile_id', { mode: 'number', unsigned: true }).notNull(),
    version: int('version', { unsigned: true }).notNull(),
    configJson: text('config_json').notNull(),
    storageTestPassed: tinyint('storage_test_passed').notNull().default(0),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    createdByUserId: bigint('created_by_user_id', { mode: 'number', unsigned: true }),
  },
  (t) => [
    uniqueIndex('storage_profile_versions_profile_version_uidx').on(t.profileId, t.version),
  ],
);

export const secrets = mysqlTable('secrets', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  scope: varchar('scope', { length: 64 }).notNull(),
  isRevoked: tinyint('is_revoked').notNull().default(0),
  currentVersionId: bigint('current_version_id', { mode: 'number', unsigned: true }),
  createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
  updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
});

export const secretVersions = mysqlTable(
  'secret_versions',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    secretId: bigint('secret_id', { mode: 'number', unsigned: true }).notNull(),
    version: int('version', { unsigned: true }).notNull(),
    keyId: varchar('key_id', { length: 64 }).notNull(),
    ciphertext: varbinary('ciphertext', { length: 4096 }).notNull(),
    nonce: binary('nonce', { length: 12 }).notNull(),
    authTag: binary('auth_tag', { length: 16 }).notNull(),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    createdByUserId: bigint('created_by_user_id', { mode: 'number', unsigned: true }),
  },
  (t) => [
    uniqueIndex('secret_versions_secret_version_uidx').on(t.secretId, t.version),
  ],
);

export const crawlerSchedules = mysqlTable(
  'crawler_schedules',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    profileId: bigint('profile_id', { mode: 'number', unsigned: true }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    kind: mysqlEnum('kind', ['manual', 'interval', 'daily', 'weekly', 'cron']).notNull(),
    cronExpression: varchar('cron_expression', { length: 64 }),
    intervalSeconds: int('interval_seconds', { unsigned: true }),
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
    overlapPolicy: mysqlEnum('overlap_policy', ['skip', 'queue', 'parallel']).notNull().default('skip'),
    misfirePolicy: mysqlEnum('misfire_policy', ['skip', 'latest_only', 'catch_up']).notNull().default('latest_only'),
    catchUpLimit: tinyint('catch_up_limit').notNull().default(3),
    maxActiveJobs: int('max_active_jobs', { unsigned: true }).notNull().default(1),
    isEnabled: tinyint('is_enabled').notNull().default(1),
    nextRunAt: datetime('next_run_at', { mode: 'string' }),
    lastMaterializedAt: datetime('last_materialized_at', { mode: 'string' }),
    configSnapshotJson: text('config_snapshot_json').notNull(),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (t) => [index('crawler_schedules_profile_id_idx').on(t.profileId)],
);

export const crawlerScheduleSkips = mysqlTable(
  'crawler_schedule_skips',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    scheduleId: bigint('schedule_id', { mode: 'number', unsigned: true }).notNull(),
    scheduledFor: datetime('scheduled_for', { mode: 'string' }).notNull(),
    reason: varchar('reason', { length: 255 }).notNull(),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (t) => [index('crawler_schedule_skips_schedule_id_idx').on(t.scheduleId)],
);

export const crawlerJobs = mysqlTable(
  'crawler_jobs',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    kind: mysqlEnum('kind', ['crawl', 'storage_test', 'cleanup']).notNull().default('crawl'),
    status: mysqlEnum('status', [
      'queued',
      'leased',
      'running',
      'retry_wait',
      'cancel_requested',
      'succeeded',
      'partial_succeeded',
      'failed',
      'cancelled',
    ]).notNull().default('queued'),
    profileId: bigint('profile_id', { mode: 'number', unsigned: true }),
    profileVersionId: bigint('profile_version_id', { mode: 'number', unsigned: true }),
    storageProfileVersionId: bigint('storage_profile_version_id', { mode: 'number', unsigned: true }),
    scheduleId: bigint('schedule_id', { mode: 'number', unsigned: true }),
    scheduledFor: datetime('scheduled_for', { mode: 'string' }),
    configSnapshotJson: text('config_snapshot_json').notNull(),
    attemptCount: int('attempt_count', { unsigned: true }).notNull().default(0),
    maxAttempts: int('max_attempts', { unsigned: true }).notNull().default(3),
    leaseWorkerId: bigint('lease_worker_id', { mode: 'number', unsigned: true }),
    leaseExpiresAt: datetime('lease_expires_at', { mode: 'string' }),
    progressJson: text('progress_json'),
    retryOfJobId: bigint('retry_of_job_id', { mode: 'number', unsigned: true }),
    nextRetryAt: datetime('next_retry_at', { mode: 'string' }),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
    startedAt: datetime('started_at', { mode: 'string' }),
    finishedAt: datetime('finished_at', { mode: 'string' }),
  },
  (t) => [
    uniqueIndex('crawler_jobs_schedule_scheduled_for_uidx').on(t.scheduleId, t.scheduledFor),
    index('crawler_jobs_status_idx').on(t.status),
    index('crawler_jobs_profile_id_idx').on(t.profileId),
  ],
);

export const crawlerJobAttempts = mysqlTable(
  'crawler_job_attempts',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    jobId: bigint('job_id', { mode: 'number', unsigned: true }).notNull(),
    attemptNo: int('attempt_no', { unsigned: true }).notNull(),
    workerId: bigint('worker_id', { mode: 'number', unsigned: true }).notNull(),
    leaseTokenHash: binary('lease_token_hash', { length: 32 }).notNull(),
    leaseExpiresAt: datetime('lease_expires_at', { mode: 'string' }).notNull(),
    startedAt: datetime('started_at', { mode: 'string' }).notNull().default(utcNow),
    finishedAt: datetime('finished_at', { mode: 'string' }),
    resultStatus: mysqlEnum('result_status', [
      'running',
      'succeeded',
      'partial_succeeded',
      'failed',
      'cancelled',
      'lease_lost',
    ]).notNull().default('running'),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
  },
  (t) => [
    uniqueIndex('crawler_job_attempts_job_attempt_uidx').on(t.jobId, t.attemptNo),
    index('crawler_job_attempts_worker_id_idx').on(t.workerId),
  ],
);

export const crawlerJobItems = mysqlTable(
  'crawler_job_items',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    jobId: bigint('job_id', { mode: 'number', unsigned: true }).notNull(),
    source: varchar('source', { length: 64 }).notNull(),
    sourceId: varchar('source_id', { length: 255 }).notNull(),
    sourceKeyHash: binary('source_key_hash', { length: 32 }).notNull(),
    stage: varchar('stage', { length: 64 }).notNull().default('pending'),
    status: mysqlEnum('status', [
      'pending',
      'running',
      'succeeded',
      'failed',
      'skipped',
      'cancelled',
    ]).notNull().default('pending'),
    animeId: bigint('anime_id', { mode: 'number', unsigned: true }),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (t) => [
    uniqueIndex('crawler_job_items_job_source_uidx').on(t.jobId, t.source, t.sourceId),
    uniqueIndex('crawler_job_items_source_key_hash_uidx').on(t.jobId, t.sourceKeyHash),
  ],
);

export const crawlerJobEvents = mysqlTable(
  'crawler_job_events',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    jobId: bigint('job_id', { mode: 'number', unsigned: true }).notNull(),
    attemptId: bigint('attempt_id', { mode: 'number', unsigned: true }),
    sequence: int('sequence', { unsigned: true }).notNull(),
    level: mysqlEnum('level', ['debug', 'info', 'warn', 'error']).notNull().default('info'),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    message: text('message'),
    payloadJson: text('payload_json'),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (t) => [
    uniqueIndex('crawler_job_events_job_attempt_seq_uidx').on(t.jobId, t.attemptId, t.sequence),
    index('crawler_job_events_job_id_idx').on(t.jobId),
  ],
);

export const crawlerOperationReceipts = mysqlTable(
  'crawler_operation_receipts',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    operationScope: varchar('operation_scope', { length: 64 }).notNull(),
    idempotencyKeyHash: binary('idempotency_key_hash', { length: 32 }).notNull(),
    jobId: bigint('job_id', { mode: 'number', unsigned: true }),
    itemId: bigint('item_id', { mode: 'number', unsigned: true }),
    requestHash: binary('request_hash', { length: 32 }).notNull(),
    responseJson: text('response_json').notNull(),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (t) => [
    uniqueIndex('crawler_operation_receipts_scope_key_uidx').on(
      t.operationScope,
      t.idempotencyKeyHash,
    ),
  ],
);

export const crawlerMediaUploads = mysqlTable(
  'crawler_media_uploads',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    jobId: bigint('job_id', { mode: 'number', unsigned: true }).notNull(),
    attemptId: bigint('attempt_id', { mode: 'number', unsigned: true }).notNull(),
    itemId: bigint('item_id', { mode: 'number', unsigned: true }),
    stagingKey: varchar('staging_key', { length: 512 }).notNull(),
    finalKey: varchar('final_key', { length: 512 }).notNull(),
    status: mysqlEnum('status', [
      'reserved',
      'uploaded',
      'published',
      'abandoned',
      'cleaned',
    ]).notNull().default('reserved'),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (t) => [
    index('crawler_media_uploads_job_attempt_idx').on(t.jobId, t.attemptId),
    uniqueIndex('crawler_media_uploads_staging_key_uidx').on(t.stagingKey),
  ],
);

export const crawlerWorkers = mysqlTable('crawler_workers', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  version: varchar('version', { length: 64 }).notNull(),
  capabilitiesJson: text('capabilities_json').notNull(),
  lastHeartbeatAt: datetime('last_heartbeat_at', { mode: 'string' }),
  isEnabled: tinyint('is_enabled').notNull().default(1),
  createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
  updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
});

export const workerCredentials = mysqlTable(
  'worker_credentials',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    workerId: bigint('worker_id', { mode: 'number', unsigned: true }).notNull(),
    tokenHash: binary('token_hash', { length: 32 }).notNull(),
    scopeJson: text('scope_json').notNull(),
    isRevoked: tinyint('is_revoked').notNull().default(0),
    expiresAt: datetime('expires_at', { mode: 'string' }),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    rotatedAt: datetime('rotated_at', { mode: 'string' }),
  },
  (t) => [
    uniqueIndex('worker_credentials_token_hash_uidx').on(t.tokenHash),
    index('worker_credentials_worker_id_idx').on(t.workerId),
  ],
);

export const auditLogs = mysqlTable(
  'audit_logs',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    actorType: mysqlEnum('actor_type', ['admin', 'worker', 'system']).notNull(),
    actorId: bigint('actor_id', { mode: 'number', unsigned: true }),
    action: varchar('action', { length: 128 }).notNull(),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    resourceId: varchar('resource_id', { length: 64 }),
    payloadJson: text('payload_json'),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (t) => [index('audit_logs_resource_idx').on(t.resourceType, t.resourceId)],
);

export const animeSources = mysqlTable(
  'anime_sources',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    animeId: bigint('anime_id', { mode: 'number', unsigned: true }).notNull(),
    source: varchar('source', { length: 64 }).notNull(),
    sourceId: varchar('source_id', { length: 255 }).notNull(),
    sourceKeyHash: binary('source_key_hash', { length: 32 }).notNull(),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (t) => [
    uniqueIndex('anime_sources_source_uidx').on(t.source, t.sourceId),
    uniqueIndex('anime_sources_source_key_hash_uidx').on(t.sourceKeyHash),
    index('anime_sources_anime_id_idx').on(t.animeId),
  ],
);

export const mediaAssets = mysqlTable(
  'media_assets',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    animeId: bigint('anime_id', { mode: 'number', unsigned: true }).notNull(),
    kind: mysqlEnum('kind', ['video', 'cover', 'fanart']).notNull(),
    storageDriver: mysqlEnum('storage_driver', ['s3', 'sftp', 'external']).notNull(),
    objectKey: varchar('object_key', { length: 512 }),
    publicUrl: varchar('public_url', { length: 1000 }),
    checksumSha256: binary('checksum_sha256', { length: 32 }),
    byteSize: bigint('byte_size', { mode: 'number', unsigned: true }),
    status: mysqlEnum('status', ['active', 'pending', 'deleted']).notNull().default('active'),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (t) => [index('media_assets_anime_id_idx').on(t.animeId)],
);

/** Tables introduced by the crawler control-plane migration (additive only). */
export const CRAWLER_CONTROL_TABLES = [
  'crawler_profiles',
  'crawler_profile_versions',
  'storage_profiles',
  'storage_profile_versions',
  'secrets',
  'secret_versions',
  'crawler_schedules',
  'crawler_schedule_skips',
  'crawler_jobs',
  'crawler_job_attempts',
  'crawler_job_items',
  'crawler_job_events',
  'crawler_operation_receipts',
  'crawler_media_uploads',
  'crawler_workers',
  'worker_credentials',
  'audit_logs',
  'anime_sources',
  'media_assets',
] as const;
