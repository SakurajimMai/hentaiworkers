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
  varchar,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

const utcNow = sql`CURRENT_TIMESTAMP`;

export const crawlerProfiles = mysqlTable('crawler_profiles', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  version: int('version', { unsigned: true }).notNull().default(1),
  schemaVersion: int('schema_version', { unsigned: true }).notNull().default(1),
  configJson: text('config_json').notNull(),
  isEnabled: tinyint('is_enabled').notNull().default(1),
  createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
  updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
});

export const crawlerSchedules = mysqlTable(
  'crawler_schedules',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    profileId: bigint('profile_id', { mode: 'number', unsigned: true }).notNull(),
    profileVersionId: bigint('profile_version_id', { mode: 'number', unsigned: true }).notNull(),
    storageProfileVersionId: bigint('storage_profile_version_id', { mode: 'number', unsigned: true }),
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
  (table) => [index('crawler_schedules_profile_id_idx').on(table.profileId)],
);

export const crawlerJobs = mysqlTable(
  'crawler_jobs',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    kind: mysqlEnum('kind', ['crawl', 'storage_test', 'cleanup']).notNull().default('crawl'),
    status: mysqlEnum('status', [
      'queued', 'leased', 'running', 'retry_wait', 'cancel_requested',
      'succeeded', 'partial_succeeded', 'failed', 'cancelled',
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
  (table) => [
    uniqueIndex('crawler_jobs_schedule_scheduled_for_uidx').on(table.scheduleId, table.scheduledFor),
    index('crawler_jobs_status_idx').on(table.status),
    index('crawler_jobs_profile_id_idx').on(table.profileId),
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
      'running', 'succeeded', 'partial_succeeded', 'failed', 'cancelled', 'lease_lost',
    ]).notNull().default('running'),
  },
  (table) => [
    uniqueIndex('crawler_job_attempts_job_attempt_uidx').on(table.jobId, table.attemptNo),
    index('crawler_job_attempts_worker_id_idx').on(table.workerId),
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
    status: mysqlEnum('status', ['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled']).notNull().default('pending'),
    animeId: bigint('anime_id', { mode: 'number', unsigned: true }),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (table) => [
    uniqueIndex('crawler_job_items_job_source_uidx').on(table.jobId, table.source, table.sourceId),
    uniqueIndex('crawler_job_items_source_key_hash_uidx').on(table.jobId, table.sourceKeyHash),
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
  (table) => [
    uniqueIndex('crawler_job_events_job_attempt_seq_uidx').on(table.jobId, table.attemptId, table.sequence),
    index('crawler_job_events_job_id_idx').on(table.jobId),
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
  (table) => [
    uniqueIndex('crawler_operation_receipts_scope_key_uidx').on(table.operationScope, table.idempotencyKeyHash),
  ],
);

export const crawlerWorkers = mysqlTable(
  'crawler_workers',
  {
    id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
    name: varchar('name', { length: 128 }).notNull(),
    version: varchar('version', { length: 64 }).notNull(),
    capabilitiesJson: text('capabilities_json').notNull(),
    lastHeartbeatAt: datetime('last_heartbeat_at', { mode: 'string' }),
    isEnabled: tinyint('is_enabled').notNull().default(1),
    tokenHash: binary('token_hash', { length: 32 }),
    scopeJson: text('scope_json').notNull(),
    tokenRevoked: tinyint('token_revoked').notNull().default(0),
    tokenExpiresAt: datetime('token_expires_at', { mode: 'string' }),
    createdAt: datetime('created_at', { mode: 'string' }).notNull().default(utcNow),
    updatedAt: datetime('updated_at', { mode: 'string' }).notNull().default(utcNow),
  },
  (table) => [uniqueIndex('crawler_workers_token_hash_uidx').on(table.tokenHash)],
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
  (table) => [
    uniqueIndex('anime_sources_source_uidx').on(table.source, table.sourceId),
    uniqueIndex('anime_sources_source_key_hash_uidx').on(table.sourceKeyHash),
    index('anime_sources_anime_id_idx').on(table.animeId),
  ],
);

export const CRAWLER_CONTROL_TABLES = [
  'crawler_profiles',
  'crawler_schedules',
  'crawler_jobs',
  'crawler_job_attempts',
  'crawler_job_items',
  'crawler_job_events',
  'crawler_operation_receipts',
  'crawler_workers',
  'anime_sources',
] as const;
