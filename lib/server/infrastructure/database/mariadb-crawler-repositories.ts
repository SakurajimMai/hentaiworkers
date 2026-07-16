/**
 * MariaDB-backed crawler control-plane repositories (no in-memory fallback).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool, withDbRetry } from '@/lib/db';
import { AppError } from '../../shared/errors';
import {
  parseCrawlerProfileConfig,
  parseStorageConfig,
  type CrawlerProfileConfig,
  type StorageConfig,
} from '../../crawler/domain/config';
import type {
  CrawlerConfigRepository,
  ProfileVersionRecord,
  SecretMeta,
  SecretRepository,
  SecretVersionRecord,
  StorageConfigRepository,
  StorageVersionRecord,
} from '../../crawler/ports/config-repository';
import type {
  AttemptRecord,
  CrawlerJobRepository,
  CrawlerRepositories,
  CrawlerScheduleRepository,
  CrawlerUnitOfWork,
  JobEventRecord,
  JobEventRepository,
  JobItemRecord,
  JobItemRepository,
  JobRecord,
  MediaUploadRecord,
  MediaUploadRepository,
  OperationReceiptRecord,
  OperationReceiptRepository,
  ScheduleRecord,
  SkippedOccurrenceRecord,
} from '../../crawler/ports/crawler-unit-of-work';
import type { CrawlerJobKind, CrawlerJobStatus } from '../../crawler/domain/job';
import type {
  WorkerCredentialRecord,
  WorkerRecord,
  WorkerRepository,
} from '../../crawler/ports/worker-repository';
import type { WorkerCapabilities as Caps } from '../../crawler/domain/worker-protocol';

function asIso(value: unknown): string {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  if (s.includes('T')) return s;
  return s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z');
}

function asIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return asIso(value);
}

function buf(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  return new Uint8Array(Buffer.from(value as ArrayBuffer));
}

export type CrawlerSqlExecutor = Readonly<{
  query(sql: string, params?: unknown[]): Promise<[unknown, unknown]>;
}>;

export type CrawlerTransactionConnection = CrawlerSqlExecutor & Readonly<{
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}>;

const transactionExecutor = new AsyncLocalStorage<CrawlerSqlExecutor>();

/** Shared by crawler repositories and catalog ingestion to preserve atomic commits. */
export function getCrawlerSqlExecutor(): CrawlerSqlExecutor {
  return transactionExecutor.getStore() ?? (pool as unknown as CrawlerSqlExecutor);
}

async function queryRows<T extends RowDataPacket[]>(
  executor: CrawlerSqlExecutor,
  sql: string,
  params: unknown[],
): Promise<T> {
  const [rows] = await executor.query(sql, params);
  return rows as T;
}

async function q<T extends RowDataPacket[]>(sql: string, params: unknown[] = []): Promise<T> {
  const executor = transactionExecutor.getStore();
  if (executor) return queryRows<T>(executor, sql, params);
  return withDbRetry(() => queryRows<T>(pool as unknown as CrawlerSqlExecutor, sql, params));
}

async function executeStatement(
  executor: CrawlerSqlExecutor,
  sql: string,
  params: unknown[],
): Promise<ResultSetHeader> {
  const [result] = await executor.query(sql, params);
  return result as ResultSetHeader;
}

async function exec(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const executor = transactionExecutor.getStore();
  if (executor) return executeStatement(executor, sql, params);
  return withDbRetry(() =>
    executeStatement(pool as unknown as CrawlerSqlExecutor, sql, params),
  );
}

function mapJob(row: RowDataPacket): JobRecord {
  return {
    id: Number(row.id),
    kind: row.kind as CrawlerJobKind,
    status: row.status as CrawlerJobStatus,
    profileId: Number(row.profile_id ?? 0),
    profileVersionId: Number(row.profile_version_id ?? 0),
    storageProfileVersionId: row.storage_profile_version_id == null
      ? null
      : Number(row.storage_profile_version_id),
    scheduleId: row.schedule_id == null ? null : Number(row.schedule_id),
    scheduledFor: asIsoOrNull(row.scheduled_for),
    configSnapshotJson: String(row.config_snapshot_json ?? '{}'),
    attemptCount: Number(row.attempt_count ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    leaseWorkerId: row.lease_worker_id == null ? null : Number(row.lease_worker_id),
    leaseExpiresAt: asIsoOrNull(row.lease_expires_at),
    progressJson: row.progress_json == null ? null : String(row.progress_json),
    retryOfJobId: row.retry_of_job_id == null ? null : Number(row.retry_of_job_id),
    nextRetryAt: asIsoOrNull(row.next_retry_at),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    startedAt: asIsoOrNull(row.started_at),
    finishedAt: asIsoOrNull(row.finished_at),
  };
}

function mapSchedule(row: RowDataPacket): ScheduleRecord {
  return {
    id: Number(row.id),
    profileId: Number(row.profile_id),
    profileVersionId: Number(row.profile_version_id ?? 1),
    storageProfileVersionId: row.storage_profile_version_id == null
      ? null
      : Number(row.storage_profile_version_id),
    name: String(row.name),
    kind: row.kind,
    cronExpression: row.cron_expression == null ? null : String(row.cron_expression),
    intervalSeconds: row.interval_seconds == null ? null : Number(row.interval_seconds),
    timezone: String(row.timezone ?? 'UTC'),
    overlapPolicy: row.overlap_policy,
    misfirePolicy: row.misfire_policy,
    catchUpLimit: Number(row.catch_up_limit ?? 3),
    maxActiveJobs: Number(row.max_active_jobs ?? 1),
    isEnabled: Number(row.is_enabled) === 1,
    nextRunAt: asIsoOrNull(row.next_run_at),
    lastMaterializedAt: asIsoOrNull(row.last_materialized_at),
    configSnapshotJson: String(row.config_snapshot_json ?? '{}'),
  };
}

export class MariaDbCrawlerConfigRepository implements CrawlerConfigRepository {
  async listProfiles() {
    const rows = await q<RowDataPacket[]>(
      'SELECT id, name, is_enabled FROM crawler_profiles ORDER BY id DESC',
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      currentVersionId: Number(row.id),
      isEnabled: Number(row.is_enabled) === 1,
    }));
  }

  async createProfile(name: string, config: CrawlerProfileConfig): Promise<ProfileVersionRecord> {
    const ins = await exec(
      `INSERT INTO crawler_profiles
        (name, version, schema_version, config_json, is_enabled)
       VALUES (?, 1, ?, ?, 1)`,
      [name, config.schemaVersion, JSON.stringify(config)],
    );
    return (await this.getProfileVersion(Number(ins.insertId)))!;
  }

  async appendProfileVersion(
    profileId: number,
    config: CrawlerProfileConfig,
  ): Promise<ProfileVersionRecord> {
    const result = await exec(
      `UPDATE crawler_profiles
       SET version = version + 1, schema_version = ?, config_json = ?, updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [config.schemaVersion, JSON.stringify(config), profileId],
    );
    if (result.affectedRows === 0) {
      throw new AppError('RESULT_INVALID', '模板不存在', 404);
    }
    return (await this.getProfileVersion(profileId))!;
  }

  async getProfileVersion(profileId: number): Promise<ProfileVersionRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_profiles WHERE id = ? LIMIT 1',
      [profileId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      profileId: Number(row.id),
      version: Number(row.version ?? 1),
      schemaVersion: Number(row.schema_version ?? 1),
      config: parseCrawlerProfileConfig(JSON.parse(String(row.config_json))),
      createdAt: asIso(row.created_at),
    };
  }

  async listProfileVersions(profileId: number): Promise<ReadonlyArray<ProfileVersionRecord>> {
    const current = await this.getProfileVersion(profileId);
    return current ? [current] : [];
  }
}

export class MariaDbStorageConfigRepository implements StorageConfigRepository {
  async listProfiles() {
    const rows = await q<RowDataPacket[]>(
      `SELECT id, name, driver, is_enabled, current_version_id
       FROM storage_profiles
       ORDER BY id DESC`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      driver: (String(row.driver) === 'sftp' ? 'sftp' : 's3') as 's3' | 'sftp',
      isEnabled: Number(row.is_enabled) === 1,
      currentVersionId:
        row.current_version_id == null ? null : Number(row.current_version_id),
    }));
  }

  async createProfile(name: string, config: StorageConfig): Promise<StorageVersionRecord> {
    const ins = await exec(
      'INSERT INTO storage_profiles (name, driver, is_enabled) VALUES (?, ?, 1)',
      [name, config.driver],
    );
    return this.appendVersion(Number(ins.insertId), config);
  }

  async appendVersion(profileId: number, config: StorageConfig): Promise<StorageVersionRecord> {
    const rows = await q<RowDataPacket[]>(
      'SELECT COALESCE(MAX(version), 0) AS v FROM storage_profile_versions WHERE profile_id = ?',
      [profileId],
    );
    const version = Number(rows[0]?.v ?? 0) + 1;
    const ins = await exec(
      `INSERT INTO storage_profile_versions (profile_id, version, config_json, storage_test_passed)
       VALUES (?, ?, ?, 0)`,
      [profileId, version, JSON.stringify(config)],
    );
    return {
      id: Number(ins.insertId),
      profileId,
      version,
      config,
      storageTestPassed: false,
      createdAt: new Date().toISOString(),
    };
  }

  async getVersion(versionId: number): Promise<StorageVersionRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM storage_profile_versions WHERE id = ? LIMIT 1',
      [versionId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      profileId: Number(row.profile_id),
      version: Number(row.version),
      config: parseStorageConfig(JSON.parse(String(row.config_json))),
      storageTestPassed: Number(row.storage_test_passed ?? 0) === 1,
      createdAt: asIso(row.created_at),
    };
  }

  async listVersions(profileId: number): Promise<ReadonlyArray<StorageVersionRecord>> {
    const rows = await q<RowDataPacket[]>(
      `SELECT * FROM storage_profile_versions
       WHERE profile_id = ?
       ORDER BY version ASC`,
      [profileId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      profileId: Number(row.profile_id),
      version: Number(row.version),
      config: parseStorageConfig(JSON.parse(String(row.config_json))),
      storageTestPassed: Number(row.storage_test_passed ?? 0) === 1,
      createdAt: asIso(row.created_at),
    }));
  }

  async markStorageTestPassed(versionId: number): Promise<void> {
    await exec(
      'UPDATE storage_profile_versions SET storage_test_passed = 1 WHERE id = ?',
      [versionId],
    );
  }

  async activateVersion(versionId: number): Promise<void> {
    const version = await this.getVersion(versionId);
    if (!version) throw new AppError('RESULT_INVALID', '存储版本不存在', 404);
    if (!version.storageTestPassed) {
      throw new AppError('RESULT_CONFLICT', '须先通过 storage_test', 409);
    }
    await exec(
      'UPDATE storage_profiles SET current_version_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
      [versionId, version.profileId],
    );
  }
}

export class MariaDbSecretRepository implements SecretRepository {
  async createMeta(name: string, scope: string): Promise<SecretMeta> {
    const ins = await exec(
      'INSERT INTO secrets (name, scope, is_revoked) VALUES (?, ?, 0)',
      [name, scope],
    );
    return {
      id: Number(ins.insertId),
      name,
      scope,
      isRevoked: false,
      currentVersion: null,
    };
  }

  async saveVersion(input: {
    secretId: number;
    version: number;
    keyId: string;
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    authTag: Uint8Array;
  }): Promise<SecretVersionRecord> {
    const ins = await exec(
      `INSERT INTO secret_versions (secret_id, version, key_id, ciphertext, nonce, auth_tag)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.secretId,
        input.version,
        input.keyId,
        Buffer.from(input.ciphertext),
        Buffer.from(input.nonce),
        Buffer.from(input.authTag),
      ],
    );
    await exec(
      'UPDATE secrets SET current_version_id = ? WHERE id = ?',
      [ins.insertId, input.secretId],
    );
    return {
      id: Number(ins.insertId),
      secretId: input.secretId,
      version: input.version,
      keyId: input.keyId,
      ciphertext: input.ciphertext,
      nonce: input.nonce,
      authTag: input.authTag,
    };
  }

  async getMeta(secretId: number): Promise<SecretMeta | null> {
    const rows = await q<RowDataPacket[]>(
      `SELECT s.*, v.version AS current_version
       FROM secrets s
       LEFT JOIN secret_versions v ON v.id = s.current_version_id
       WHERE s.id = ? LIMIT 1`,
      [secretId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      name: String(row.name),
      scope: String(row.scope),
      isRevoked: Number(row.is_revoked) === 1,
      currentVersion: row.current_version == null ? null : Number(row.current_version),
    };
  }

  async getCurrentVersion(secretId: number): Promise<SecretVersionRecord | null> {
    const rows = await q<RowDataPacket[]>(
      `SELECT v.* FROM secret_versions v
       INNER JOIN secrets s ON s.current_version_id = v.id
       WHERE s.id = ? LIMIT 1`,
      [secretId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      secretId: Number(row.secret_id),
      version: Number(row.version),
      keyId: String(row.key_id),
      ciphertext: buf(row.ciphertext),
      nonce: buf(row.nonce),
      authTag: buf(row.auth_tag),
    };
  }

  async revoke(secretId: number): Promise<void> {
    await exec('UPDATE secrets SET is_revoked = 1 WHERE id = ?', [secretId]);
  }

  async list(): Promise<ReadonlyArray<SecretMeta>> {
    const rows = await q<RowDataPacket[]>(
      `SELECT s.*, v.version AS current_version
       FROM secrets s
       LEFT JOIN secret_versions v ON v.id = s.current_version_id
       ORDER BY s.id DESC`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      scope: String(row.scope),
      isRevoked: Number(row.is_revoked) === 1,
      currentVersion: row.current_version == null ? null : Number(row.current_version),
    }));
  }
}

export class MariaDbWorkerRepository implements WorkerRepository {
  async getWorker(workerId: number): Promise<WorkerRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_workers WHERE id = ? LIMIT 1',
      [workerId],
    );
    const row = rows[0];
    if (!row) return null;
    return mapWorker(row);
  }

  async listWorkers(): Promise<ReadonlyArray<WorkerRecord>> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_workers ORDER BY id ASC',
    );
    return rows.map(mapWorker);
  }

  async upsertRegistration(input: {
    workerId: number;
    name: string;
    version: string;
    capabilities: Caps;
  }): Promise<WorkerRecord> {
    await exec(
      `UPDATE crawler_workers
       SET name = ?, version = ?, capabilities_json = ?, last_heartbeat_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [input.name, input.version, JSON.stringify(input.capabilities), input.workerId],
    );
    const w = await this.getWorker(input.workerId);
    if (!w) throw new AppError('RESULT_INVALID', 'Worker 不存在', 404);
    return w;
  }

  async heartbeat(input: {
    workerId: number;
    version?: string;
    capabilities?: Caps;
    currentLoad?: number;
  }): Promise<WorkerRecord> {
    const current = await this.getWorker(input.workerId);
    if (!current) throw new AppError('RESULT_INVALID', 'Worker 不存在', 404);
    let capsJson = current.capabilitiesJson;
    if (input.capabilities) {
      capsJson = JSON.stringify(input.capabilities);
    } else if (input.currentLoad != null) {
      try {
        const caps = JSON.parse(current.capabilitiesJson) as Caps;
        capsJson = JSON.stringify({ ...caps, currentLoad: input.currentLoad });
      } catch {
        /* keep */
      }
    }
    await exec(
      `UPDATE crawler_workers
       SET version = COALESCE(?, version), capabilities_json = ?, last_heartbeat_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [input.version ?? null, capsJson, input.workerId],
    );
    return (await this.getWorker(input.workerId))!;
  }

  async findCredentialByTokenHash(
    tokenHash: Uint8Array,
  ): Promise<WorkerCredentialRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_workers WHERE token_hash = ? LIMIT 1',
      [Buffer.from(tokenHash)],
    );
    return rows[0] ? mapEmbeddedCredential(rows[0]) : null;
  }

  async listCredentials(workerId: number): Promise<ReadonlyArray<WorkerCredentialRecord>> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_workers WHERE id = ? AND token_hash IS NOT NULL LIMIT 1',
      [workerId],
    );
    return rows[0] ? [mapEmbeddedCredential(rows[0])] : [];
  }

  async createWorkerWithToken(input: {
    name: string;
    tokenHash: Uint8Array;
    scopes: readonly string[];
    version?: string;
  }): Promise<{ worker: WorkerRecord; credential: WorkerCredentialRecord }> {
    const ins = await exec(
      `INSERT INTO crawler_workers
        (name, version, capabilities_json, is_enabled, token_hash, scope_json, token_revoked)
       VALUES (?, ?, '{}', 1, ?, ?, 0)`,
      [
        input.name,
        input.version ?? '0.0.0',
        Buffer.from(input.tokenHash),
        JSON.stringify([...input.scopes]),
      ],
    );
    const worker = (await this.getWorker(Number(ins.insertId)))!;
    const credential = (await this.listCredentials(worker.id))[0];
    return { worker, credential };
  }

  async revokeCredential(credentialId: number): Promise<void> {
    await exec(
      'UPDATE crawler_workers SET token_revoked = 1, updated_at = UTC_TIMESTAMP() WHERE id = ?',
      [credentialId],
    );
  }
}

function mapWorker(row: RowDataPacket): WorkerRecord {
  return {
    id: Number(row.id),
    name: String(row.name),
    version: String(row.version),
    capabilitiesJson: String(row.capabilities_json ?? '{}'),
    lastHeartbeatAt: asIsoOrNull(row.last_heartbeat_at),
    isEnabled: Number(row.is_enabled) === 1,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  };
}

function mapEmbeddedCredential(row: RowDataPacket): WorkerCredentialRecord {
  return {
    id: Number(row.id),
    workerId: Number(row.id),
    tokenHash: buf(row.token_hash),
    scopeJson: String(row.scope_json ?? '[]'),
    isRevoked: Number(row.token_revoked) === 1,
    expiresAt: asIsoOrNull(row.token_expires_at),
    createdAt: asIso(row.created_at),
    rotatedAt: null,
  };
}

class MariaDbScheduleRepo implements CrawlerScheduleRepository {
  async create(
    input: Omit<ScheduleRecord, 'id' | 'lastMaterializedAt'> & {
      lastMaterializedAt?: string | null;
    },
  ): Promise<ScheduleRecord> {
    const ins = await exec(
      `INSERT INTO crawler_schedules (
        profile_id, profile_version_id, storage_profile_version_id,
        name, kind, cron_expression, interval_seconds, timezone,
        overlap_policy, misfire_policy, catch_up_limit, max_active_jobs, is_enabled,
        next_run_at, last_materialized_at, config_snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.profileId,
        input.profileVersionId,
        input.storageProfileVersionId,
        input.name,
        input.kind,
        input.cronExpression,
        input.intervalSeconds,
        input.timezone,
        input.overlapPolicy,
        input.misfirePolicy,
        input.catchUpLimit,
        input.maxActiveJobs,
        input.isEnabled ? 1 : 0,
        input.nextRunAt,
        input.lastMaterializedAt ?? null,
        input.configSnapshotJson,
      ],
    );
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_schedules WHERE id = ? LIMIT 1',
      [ins.insertId],
    );
    return mapSchedule({ ...rows[0], profile_version_id: input.profileVersionId });
  }

  async update(scheduleId: number, patch: Partial<ScheduleRecord>): Promise<ScheduleRecord> {
    const fields: string[] = [];
    const params: unknown[] = [];
    const map: Record<string, string> = {
      nextRunAt: 'next_run_at',
      lastMaterializedAt: 'last_materialized_at',
      isEnabled: 'is_enabled',
      configSnapshotJson: 'config_snapshot_json',
      maxActiveJobs: 'max_active_jobs',
    };
    for (const [k, col] of Object.entries(map)) {
      if ((patch as Record<string, unknown>)[k] !== undefined) {
        fields.push(`${col} = ?`);
        let v = (patch as Record<string, unknown>)[k];
        if (k === 'isEnabled') v = v ? 1 : 0;
        params.push(v);
      }
    }
    if (fields.length) {
      params.push(scheduleId);
      await exec(`UPDATE crawler_schedules SET ${fields.join(', ')} WHERE id = ?`, params);
    }
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_schedules WHERE id = ? LIMIT 1',
      [scheduleId],
    );
    if (!rows[0]) throw new AppError('RESULT_INVALID', '调度不存在', 404);
    return mapSchedule(rows[0]);
  }

  async get(scheduleId: number): Promise<ScheduleRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_schedules WHERE id = ? LIMIT 1',
      [scheduleId],
    );
    return rows[0] ? mapSchedule(rows[0]) : null;
  }

  async listEnabledDue(nowIso: string): Promise<ReadonlyArray<ScheduleRecord>> {
    const rows = await q<RowDataPacket[]>(
      `SELECT * FROM crawler_schedules
       WHERE is_enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
       ORDER BY next_run_at ASC`,
      [nowIso.replace('T', ' ').replace('Z', '')],
    );
    return rows.map(mapSchedule);
  }

  async listEnabled(): Promise<ReadonlyArray<ScheduleRecord>> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_schedules WHERE is_enabled = 1',
    );
    return rows.map(mapSchedule);
  }

  async listSkipped(_scheduleId: number): Promise<ReadonlyArray<SkippedOccurrenceRecord>> {
    return [];
  }

  async recordSkipped(input: {
    scheduleId: number;
    scheduledFor: string;
    reason: string;
  }): Promise<SkippedOccurrenceRecord> {
    return {
      id: 0,
      scheduleId: input.scheduleId,
      scheduledFor: input.scheduledFor,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    };
  }
}

class MariaDbJobRepo implements CrawlerJobRepository {
  async create(input: {
    kind: CrawlerJobKind;
    profileId: number;
    profileVersionId: number;
    storageProfileVersionId?: number | null;
    scheduleId?: number | null;
    scheduledFor?: string | null;
    configSnapshotJson: string;
    maxAttempts?: number;
    retryOfJobId?: number | null;
  }): Promise<JobRecord> {
    const ins = await exec(
      `INSERT INTO crawler_jobs (
        kind, status, profile_id, profile_version_id, storage_profile_version_id,
        schedule_id, scheduled_for, config_snapshot_json, max_attempts, retry_of_job_id
      ) VALUES (?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.kind,
        input.profileId,
        input.profileVersionId,
        input.storageProfileVersionId ?? null,
        input.scheduleId ?? null,
        input.scheduledFor
          ? input.scheduledFor.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '')
          : null,
        input.configSnapshotJson,
        input.maxAttempts ?? 3,
        input.retryOfJobId ?? null,
      ],
    );
    return (await this.get(Number(ins.insertId)))!;
  }

  async get(jobId: number): Promise<JobRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_jobs WHERE id = ? LIMIT 1',
      [jobId],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async getForUpdate(jobId: number): Promise<JobRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_jobs WHERE id = ? LIMIT 1 FOR UPDATE',
      [jobId],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async casStatus(input: {
    jobId: number;
    expectedStatuses: readonly CrawlerJobStatus[];
    nextStatus: CrawlerJobStatus;
    patch?: Partial<
      Pick<
        JobRecord,
        | 'leaseWorkerId'
        | 'leaseExpiresAt'
        | 'attemptCount'
        | 'progressJson'
        | 'nextRetryAt'
        | 'startedAt'
        | 'finishedAt'
      >
    >;
  }): Promise<JobRecord | null> {
    const sets = ['status = ?'];
    const params: unknown[] = [input.nextStatus];
    const p = input.patch ?? {};
    if (p.leaseWorkerId !== undefined) {
      sets.push('lease_worker_id = ?');
      params.push(p.leaseWorkerId);
    }
    if (p.leaseExpiresAt !== undefined) {
      sets.push('lease_expires_at = ?');
      params.push(
        p.leaseExpiresAt
          ? p.leaseExpiresAt.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '')
          : null,
      );
    }
    if (p.attemptCount !== undefined) {
      sets.push('attempt_count = ?');
      params.push(p.attemptCount);
    }
    if (p.progressJson !== undefined) {
      sets.push('progress_json = ?');
      params.push(p.progressJson);
    }
    if (p.nextRetryAt !== undefined) {
      sets.push('next_retry_at = ?');
      params.push(
        p.nextRetryAt
          ? p.nextRetryAt.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '')
          : null,
      );
    }
    if (p.startedAt !== undefined) {
      sets.push('started_at = ?');
      params.push(
        p.startedAt
          ? p.startedAt.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '')
          : null,
      );
    }
    if (p.finishedAt !== undefined) {
      sets.push('finished_at = ?');
      params.push(
        p.finishedAt
          ? p.finishedAt.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '')
          : null,
      );
    }
    const placeholders = input.expectedStatuses.map(() => '?').join(',');
    params.push(input.jobId, ...input.expectedStatuses);
    const result = await exec(
      `UPDATE crawler_jobs SET ${sets.join(', ')}
       WHERE id = ? AND status IN (${placeholders})`,
      params,
    );
    if (result.affectedRows === 0) return null;
    return this.get(input.jobId);
  }

  async listQueued(limit: number): Promise<ReadonlyArray<JobRecord>> {
    const rows = await q<RowDataPacket[]>(
      `SELECT * FROM crawler_jobs WHERE status = 'queued' ORDER BY id ASC LIMIT ?`,
      [limit],
    );
    return rows.map(mapJob);
  }

  async listByProfile(profileId: number): Promise<ReadonlyArray<JobRecord>> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_jobs WHERE profile_id = ? ORDER BY id DESC',
      [profileId],
    );
    return rows.map(mapJob);
  }

  async listByStatuses(
    statuses: readonly CrawlerJobStatus[],
  ): Promise<ReadonlyArray<JobRecord>> {
    if (!statuses.length) return [];
    const placeholders = statuses.map(() => '?').join(',');
    const rows = await q<RowDataPacket[]>(
      `SELECT * FROM crawler_jobs WHERE status IN (${placeholders}) ORDER BY id DESC`,
      [...statuses],
    );
    return rows.map(mapJob);
  }

  async deleteCascade(jobId: number): Promise<boolean> {
    // retry_of_job_id is intentionally not an FK; preserve retries without dangling lineage.
    await exec('UPDATE crawler_jobs SET retry_of_job_id = NULL WHERE retry_of_job_id = ?', [jobId]);
    // Receipts may reference the job directly or only one of its items.
    await exec(
      `DELETE FROM crawler_operation_receipts
       WHERE job_id = ?
          OR item_id IN (SELECT id FROM crawler_job_items WHERE job_id = ?)`,
      [jobId, jobId],
    );
    // Media reservations reference jobs with RESTRICT and must be removed first.
    await exec('DELETE FROM crawler_media_uploads WHERE job_id = ?', [jobId]);
    await exec('DELETE FROM crawler_job_events WHERE job_id = ?', [jobId]);
    await exec('DELETE FROM crawler_job_items WHERE job_id = ?', [jobId]);
    await exec('DELETE FROM crawler_job_attempts WHERE job_id = ?', [jobId]);
    const result = await exec('DELETE FROM crawler_jobs WHERE id = ?', [jobId]);
    return Number(result.affectedRows ?? 0) > 0;
  }

  async deleteTerminalOlderThan(input: {
    olderThanIso: string;
    statuses: readonly CrawlerJobStatus[];
    limit?: number;
  }): Promise<number> {
    if (!input.statuses.length) return 0;
    const cutoff = input.olderThanIso
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '')
      .replace('Z', '');
    const limit = Math.min(500, Math.max(1, input.limit ?? 100));
    const placeholders = input.statuses.map(() => '?').join(',');
    const idRows = await q<RowDataPacket[]>(
      `SELECT id FROM crawler_jobs
       WHERE status IN (${placeholders})
         AND COALESCE(finished_at, created_at) < ?
       ORDER BY COALESCE(finished_at, created_at) ASC
       LIMIT ?
       FOR UPDATE`,
      [...input.statuses, cutoff, limit],
    );
    let removed = 0;
    for (const row of idRows) {
      const id = Number(row.id);
      if (!id) continue;
      if (await this.deleteCascade(id)) removed += 1;
    }
    return removed;
  }

  async createAttempt(input: {
    jobId: number;
    attemptNo: number;
    workerId: number;
    leaseTokenHash: Uint8Array;
    leaseExpiresAt: string;
  }): Promise<AttemptRecord> {
    const lease = input.leaseExpiresAt
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '')
      .replace('Z', '');
    const ins = await exec(
      `INSERT INTO crawler_job_attempts
        (job_id, attempt_no, worker_id, lease_token_hash, lease_expires_at, result_status)
       VALUES (?, ?, ?, ?, ?, 'running')`,
      [
        input.jobId,
        input.attemptNo,
        input.workerId,
        Buffer.from(input.leaseTokenHash),
        lease,
      ],
    );
    return (await this.getAttempt(Number(ins.insertId)))!;
  }

  async getAttempt(attemptId: number): Promise<AttemptRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_job_attempts WHERE id = ? LIMIT 1',
      [attemptId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      jobId: Number(row.job_id),
      attemptNo: Number(row.attempt_no),
      workerId: Number(row.worker_id),
      leaseTokenHash: buf(row.lease_token_hash),
      leaseExpiresAt: asIso(row.lease_expires_at),
      startedAt: asIso(row.started_at),
      finishedAt: asIsoOrNull(row.finished_at),
      resultStatus: row.result_status,
      errorCode: row.error_code == null ? null : String(row.error_code),
      errorMessage: row.error_message == null ? null : String(row.error_message),
    };
  }

  async getCurrentAttempt(jobId: number): Promise<AttemptRecord | null> {
    const rows = await q<RowDataPacket[]>(
      `SELECT * FROM crawler_job_attempts WHERE job_id = ?
       ORDER BY attempt_no DESC LIMIT 1`,
      [jobId],
    );
    if (!rows[0]) return null;
    return this.getAttempt(Number(rows[0].id));
  }

  async updateAttempt(
    attemptId: number,
    patch: Partial<Pick<AttemptRecord, 'leaseExpiresAt' | 'finishedAt' | 'resultStatus' | 'errorCode' | 'errorMessage'>>,
  ): Promise<AttemptRecord> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.leaseExpiresAt !== undefined) {
      sets.push('lease_expires_at = ?');
      params.push(
        patch.leaseExpiresAt.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', ''),
      );
    }
    if (patch.finishedAt !== undefined) {
      sets.push('finished_at = ?');
      params.push(
        patch.finishedAt
          ? patch.finishedAt.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '')
          : null,
      );
    }
    if (patch.resultStatus !== undefined) {
      sets.push('result_status = ?');
      params.push(patch.resultStatus);
    }
    if (patch.errorCode !== undefined) {
      sets.push('error_code = ?');
      params.push(patch.errorCode);
    }
    if (patch.errorMessage !== undefined) {
      sets.push('error_message = ?');
      params.push(patch.errorMessage);
    }
    if (sets.length) {
      params.push(attemptId);
      await exec(`UPDATE crawler_job_attempts SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    const row = await this.getAttempt(attemptId);
    if (!row) throw new AppError('RESULT_INVALID', 'attempt 不存在', 404);
    return row;
  }
}

class MariaDbReceiptRepo implements OperationReceiptRepository {
  async find(
    operationScope: string,
    idempotencyKeyHash: Uint8Array,
  ): Promise<OperationReceiptRecord | null> {
    const rows = await q<RowDataPacket[]>(
      `SELECT * FROM crawler_operation_receipts
       WHERE operation_scope = ? AND idempotency_key_hash = ? LIMIT 1`,
      [operationScope, Buffer.from(idempotencyKeyHash)],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      operationScope: String(row.operation_scope),
      idempotencyKeyHash: buf(row.idempotency_key_hash),
      jobId: row.job_id == null ? null : Number(row.job_id),
      itemId: row.item_id == null ? null : Number(row.item_id),
      requestHash: buf(row.request_hash),
      responseJson: String(row.response_json),
      createdAt: asIso(row.created_at),
    };
  }

  async save(input: {
    operationScope: string;
    idempotencyKeyHash: Uint8Array;
    jobId: number | null;
    itemId: number | null;
    requestHash: Uint8Array;
    responseJson: string;
  }): Promise<OperationReceiptRecord> {
    try {
      const ins = await exec(
        `INSERT INTO crawler_operation_receipts
          (operation_scope, idempotency_key_hash, job_id, item_id, request_hash, response_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.operationScope,
          Buffer.from(input.idempotencyKeyHash),
          input.jobId,
          input.itemId,
          Buffer.from(input.requestHash),
          input.responseJson,
        ],
      );
      return {
        id: Number(ins.insertId),
        operationScope: input.operationScope,
        idempotencyKeyHash: input.idempotencyKeyHash,
        jobId: input.jobId,
        itemId: input.itemId,
        requestHash: input.requestHash,
        responseJson: input.responseJson,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/Duplicate/i.test(msg)) {
        throw new AppError('RESULT_CONFLICT', '幂等键已存在', 409);
      }
      throw error;
    }
  }
}

class MariaDbItemRepo implements JobItemRepository {
  async upsert(input: {
    jobId: number;
    source: string;
    sourceId: string;
    stage: string;
    status: JobItemRecord['status'];
    animeId?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<JobItemRecord> {
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256')
      .update(`${input.source}\0${input.sourceId}`, 'utf8')
      .digest();
    await exec(
      `INSERT INTO crawler_job_items
        (job_id, source, source_id, source_key_hash, stage, status, anime_id, error_code, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         stage = VALUES(stage),
         status = VALUES(status),
         anime_id = VALUES(anime_id),
         error_code = VALUES(error_code),
         error_message = VALUES(error_message)`,
      [
        input.jobId,
        input.source,
        input.sourceId,
        hash,
        input.stage,
        input.status,
        input.animeId ?? null,
        input.errorCode ?? null,
        input.errorMessage ?? null,
      ],
    );
    const rows = await q<RowDataPacket[]>(
      `SELECT * FROM crawler_job_items
       WHERE job_id = ? AND source = ? AND source_id = ? LIMIT 1`,
      [input.jobId, input.source, input.sourceId],
    );
    const row = rows[0];
    return {
      id: Number(row.id),
      jobId: Number(row.job_id),
      source: String(row.source),
      sourceId: String(row.source_id),
      stage: String(row.stage),
      status: row.status,
      animeId: row.anime_id == null ? null : Number(row.anime_id),
      errorCode: row.error_code == null ? null : String(row.error_code),
      errorMessage: row.error_message == null ? null : String(row.error_message),
    };
  }

  async listByJob(jobId: number): Promise<ReadonlyArray<JobItemRecord>> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_job_items WHERE job_id = ? ORDER BY id ASC',
      [jobId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      jobId: Number(row.job_id),
      source: String(row.source),
      sourceId: String(row.source_id),
      stage: String(row.stage),
      status: row.status,
      animeId: row.anime_id == null ? null : Number(row.anime_id),
      errorCode: row.error_code == null ? null : String(row.error_code),
      errorMessage: row.error_message == null ? null : String(row.error_message),
    }));
  }

  async get(itemId: number): Promise<JobItemRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_job_items WHERE id = ? LIMIT 1',
      [itemId],
    );
    if (!rows[0]) return null;
    const list = await this.listByJob(Number(rows[0].job_id));
    return list.find((i) => i.id === itemId) ?? null;
  }
}

class MariaDbEventRepo implements JobEventRepository {
  async append(input: {
    jobId: number;
    attemptId: number | null;
    sequence: number;
    level: JobEventRecord['level'];
    eventType: string;
    message?: string | null;
    payloadJson?: string | null;
  }): Promise<JobEventRecord> {
    try {
      const ins = await exec(
        `INSERT INTO crawler_job_events
          (job_id, attempt_id, sequence, level, event_type, message, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.jobId,
          input.attemptId,
          input.sequence,
          input.level,
          input.eventType,
          input.message ?? null,
          input.payloadJson ?? null,
        ],
      );
      return {
        id: Number(ins.insertId),
        jobId: input.jobId,
        attemptId: input.attemptId,
        sequence: input.sequence,
        level: input.level,
        eventType: input.eventType,
        message: input.message ?? null,
        payloadJson: input.payloadJson ?? null,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/Duplicate/i.test(msg)) {
        throw new AppError('RESULT_CONFLICT', '事件序号重复', 409);
      }
      throw error;
    }
  }

  async listByAttempt(
    jobId: number,
    attemptId: number,
  ): Promise<ReadonlyArray<JobEventRecord>> {
    const rows = await q<RowDataPacket[]>(
      `SELECT * FROM crawler_job_events
       WHERE job_id = ? AND attempt_id = ? ORDER BY sequence ASC`,
      [jobId, attemptId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      jobId: Number(row.job_id),
      attemptId: row.attempt_id == null ? null : Number(row.attempt_id),
      sequence: Number(row.sequence),
      level: row.level,
      eventType: String(row.event_type),
      message: row.message == null ? null : String(row.message),
      payloadJson: row.payload_json == null ? null : String(row.payload_json),
      createdAt: asIso(row.created_at),
    }));
  }
}

class LegacyMariaDbMediaRepo implements MediaUploadRepository {
  async reserve(input: {
    jobId: number;
    attemptId: number;
    itemId: number | null;
    stagingKey: string;
    finalKey: string;
  }): Promise<MediaUploadRecord> {
    const ins = await exec(
      `INSERT INTO crawler_media_uploads
        (job_id, attempt_id, item_id, staging_key, final_key, status)
       VALUES (?, ?, ?, ?, ?, 'reserved')`,
      [input.jobId, input.attemptId, input.itemId, input.stagingKey, input.finalKey],
    );
    return {
      id: Number(ins.insertId),
      jobId: input.jobId,
      attemptId: input.attemptId,
      itemId: input.itemId,
      stagingKey: input.stagingKey,
      finalKey: input.finalKey,
      status: 'reserved',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async get(id: number): Promise<MediaUploadRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_media_uploads WHERE id = ? LIMIT 1',
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      jobId: Number(row.job_id),
      attemptId: Number(row.attempt_id),
      itemId: row.item_id == null ? null : Number(row.item_id),
      stagingKey: String(row.staging_key),
      finalKey: String(row.final_key),
      status: row.status,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
    };
  }

  async listByStatus(
    status: MediaUploadRecord['status'],
  ): Promise<ReadonlyArray<MediaUploadRecord>> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_media_uploads WHERE status = ?',
      [status],
    );
    return Promise.all(rows.map((r) => this.get(Number(r.id)) as Promise<MediaUploadRecord>));
  }

  async markStatus(
    id: number,
    status: MediaUploadRecord['status'],
  ): Promise<MediaUploadRecord> {
    await exec('UPDATE crawler_media_uploads SET status = ? WHERE id = ?', [status, id]);
    return (await this.get(id))!;
  }

  async listExpiredReserved(beforeIso: string): Promise<ReadonlyArray<MediaUploadRecord>> {
    const before = beforeIso.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '');
    const rows = await q<RowDataPacket[]>(
      `SELECT * FROM crawler_media_uploads
       WHERE status = 'reserved' AND created_at < ?`,
      [before],
    );
    return Promise.all(rows.map((r) => this.get(Number(r.id)) as Promise<MediaUploadRecord>));
  }
}

class DisabledMediaUploadRepository implements MediaUploadRepository {
  async reserve(): Promise<MediaUploadRecord> {
    throw new AppError(
      'STORAGE_UNAVAILABLE',
      '当前为外链采集模式，未启用对象上传',
      503,
    );
  }

  async get(): Promise<MediaUploadRecord | null> {
    return null;
  }

  async listByStatus(): Promise<ReadonlyArray<MediaUploadRecord>> {
    return [];
  }

  async markStatus(): Promise<MediaUploadRecord> {
    throw new AppError('STORAGE_UNAVAILABLE', '当前未启用对象上传', 503);
  }

  async listExpiredReserved(): Promise<ReadonlyArray<MediaUploadRecord>> {
    return [];
  }
}

export class MariaDbCrawlerUnitOfWork implements CrawlerUnitOfWork {
  readonly repos: CrawlerRepositories = {
    schedules: new MariaDbScheduleRepo(),
    jobs: new MariaDbJobRepo(),
    receipts: new MariaDbReceiptRepo(),
    items: new MariaDbItemRepo(),
    events: new MariaDbEventRepo(),
    // Hanime download/upload jobs need reservation rows; MacCMS external-URL jobs never call media.reserve.
    media: new LegacyMariaDbMediaRepo(),
  };

  constructor(
    private readonly acquireConnection: () => Promise<CrawlerTransactionConnection> = async () =>
      (await pool.getConnection()) as unknown as CrawlerTransactionConnection,
  ) {}

  async runInTransaction<T>(fn: (repos: CrawlerRepositories) => Promise<T>): Promise<T> {
    if (transactionExecutor.getStore()) return fn(this.repos);

    const connection = await this.acquireConnection();
    try {
      await connection.beginTransaction();
      return await transactionExecutor.run(connection, async () => {
        const result = await fn(this.repos);
        await connection.commit();
        return result;
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export function createMariaDbCrawlerUnitOfWork(
  acquireConnection: () => Promise<CrawlerTransactionConnection>,
): MariaDbCrawlerUnitOfWork {
  return new MariaDbCrawlerUnitOfWork(acquireConnection);
}
