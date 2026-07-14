/**
 * MariaDB-backed crawler control-plane repositories (no in-memory fallback).
 */
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

async function q<T extends RowDataPacket[]>(sql: string, params: unknown[] = []): Promise<T> {
  return withDbRetry(async () => {
    const [rows] = await pool.query<T>(sql, params);
    return rows;
  });
}

async function exec(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  return withDbRetry(async () => {
    const [result] = await pool.query<ResultSetHeader>(sql, params);
    return result;
  });
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
  async createProfile(name: string, config: CrawlerProfileConfig): Promise<ProfileVersionRecord> {
    const ins = await exec(
      'INSERT INTO crawler_profiles (name, is_enabled) VALUES (?, 1)',
      [name],
    );
    const profileId = Number(ins.insertId);
    return this.appendProfileVersion(profileId, config);
  }

  async appendProfileVersion(
    profileId: number,
    config: CrawlerProfileConfig,
  ): Promise<ProfileVersionRecord> {
    const rows = await q<RowDataPacket[]>(
      'SELECT COALESCE(MAX(version), 0) AS v FROM crawler_profile_versions WHERE profile_id = ?',
      [profileId],
    );
    const version = Number(rows[0]?.v ?? 0) + 1;
    const configJson = JSON.stringify(config);
    const ins = await exec(
      `INSERT INTO crawler_profile_versions (profile_id, version, schema_version, config_json)
       VALUES (?, ?, ?, ?)`,
      [profileId, version, config.schemaVersion, configJson],
    );
    const id = Number(ins.insertId);
    await exec('UPDATE crawler_profiles SET current_version_id = ? WHERE id = ?', [id, profileId]);
    return {
      id,
      profileId,
      version,
      schemaVersion: config.schemaVersion,
      config,
      createdAt: new Date().toISOString(),
    };
  }

  async getProfileVersion(versionId: number): Promise<ProfileVersionRecord | null> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_profile_versions WHERE id = ? LIMIT 1',
      [versionId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      profileId: Number(row.profile_id),
      version: Number(row.version),
      schemaVersion: Number(row.schema_version),
      config: parseCrawlerProfileConfig(JSON.parse(String(row.config_json))),
      createdAt: asIso(row.created_at),
    };
  }

  async listProfileVersions(profileId: number): Promise<ReadonlyArray<ProfileVersionRecord>> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_profile_versions WHERE profile_id = ? ORDER BY version ASC',
      [profileId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      profileId: Number(row.profile_id),
      version: Number(row.version),
      schemaVersion: Number(row.schema_version),
      config: parseCrawlerProfileConfig(JSON.parse(String(row.config_json))),
      createdAt: asIso(row.created_at),
    }));
  }
}

export class MariaDbStorageConfigRepository implements StorageConfigRepository {
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
      'UPDATE storage_profiles SET current_version_id = ? WHERE id = ?',
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
      'SELECT * FROM worker_credentials WHERE token_hash = ? LIMIT 1',
      [Buffer.from(tokenHash)],
    );
    const row = rows[0];
    if (!row) return null;
    return mapCredential(row);
  }

  async listCredentials(workerId: number): Promise<ReadonlyArray<WorkerCredentialRecord>> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM worker_credentials WHERE worker_id = ?',
      [workerId],
    );
    return rows.map(mapCredential);
  }

  async createWorkerWithToken(input: {
    name: string;
    tokenHash: Uint8Array;
    scopes: readonly string[];
    version?: string;
  }): Promise<{ worker: WorkerRecord; credential: WorkerCredentialRecord }> {
    const wIns = await exec(
      `INSERT INTO crawler_workers (name, version, capabilities_json, is_enabled)
       VALUES (?, ?, '{}', 1)`,
      [input.name, input.version ?? '0.0.0'],
    );
    const workerId = Number(wIns.insertId);
    const cIns = await exec(
      `INSERT INTO worker_credentials (worker_id, token_hash, scope_json, is_revoked)
       VALUES (?, ?, ?, 0)`,
      [workerId, Buffer.from(input.tokenHash), JSON.stringify([...input.scopes])],
    );
    const worker = (await this.getWorker(workerId))!;
    const creds = await q<RowDataPacket[]>(
      'SELECT * FROM worker_credentials WHERE id = ? LIMIT 1',
      [cIns.insertId],
    );
    return { worker, credential: mapCredential(creds[0]) };
  }

  async revokeCredential(credentialId: number): Promise<void> {
    await exec('UPDATE worker_credentials SET is_revoked = 1 WHERE id = ?', [credentialId]);
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

function mapCredential(row: RowDataPacket): WorkerCredentialRecord {
  return {
    id: Number(row.id),
    workerId: Number(row.worker_id),
    tokenHash: buf(row.token_hash),
    scopeJson: String(row.scope_json ?? '[]'),
    isRevoked: Number(row.is_revoked) === 1,
    expiresAt: asIsoOrNull(row.expires_at),
    createdAt: asIso(row.created_at),
    rotatedAt: asIsoOrNull(row.rotated_at),
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
        profile_id, name, kind, cron_expression, interval_seconds, timezone,
        overlap_policy, misfire_policy, catch_up_limit, max_active_jobs, is_enabled,
        next_run_at, last_materialized_at, config_snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.profileId,
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
    // profile_version_id may exist only after 0002; store via update if column present
    try {
      await exec(
        'UPDATE crawler_schedules SET profile_version_id = ? WHERE id = ?',
        [input.profileVersionId, ins.insertId],
      );
    } catch {
      /* column may not exist on partial deploys */
    }
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

  async listSkipped(scheduleId: number): Promise<ReadonlyArray<SkippedOccurrenceRecord>> {
    const rows = await q<RowDataPacket[]>(
      'SELECT * FROM crawler_schedule_skips WHERE schedule_id = ? ORDER BY id DESC LIMIT 100',
      [scheduleId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      scheduleId: Number(r.schedule_id),
      scheduledFor: asIso(r.scheduled_for),
      reason: String(r.reason),
      createdAt: asIso(r.created_at),
    }));
  }

  async recordSkipped(input: {
    scheduleId: number;
    scheduledFor: string;
    reason: string;
  }): Promise<SkippedOccurrenceRecord> {
    const ins = await exec(
      `INSERT INTO crawler_schedule_skips (schedule_id, scheduled_for, reason)
       VALUES (?, ?, ?)`,
      [input.scheduleId, input.scheduledFor.replace('T', ' ').replace('Z', ''), input.reason],
    );
    return {
      id: Number(ins.insertId),
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
    patch: Partial<Pick<AttemptRecord, 'leaseExpiresAt' | 'finishedAt' | 'resultStatus'>>,
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

class MariaDbMediaRepo implements MediaUploadRepository {
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

export class MariaDbCrawlerUnitOfWork implements CrawlerUnitOfWork {
  readonly repos: CrawlerRepositories = {
    schedules: new MariaDbScheduleRepo(),
    jobs: new MariaDbJobRepo(),
    receipts: new MariaDbReceiptRepo(),
    items: new MariaDbItemRepo(),
    events: new MariaDbEventRepo(),
    media: new MariaDbMediaRepo(),
  };

  async runInTransaction<T>(fn: (repos: CrawlerRepositories) => Promise<T>): Promise<T> {
    // Pool-level sequential critical sections: use a connection transaction.
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(this.repos);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
