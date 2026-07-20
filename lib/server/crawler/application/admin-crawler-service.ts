import { randomBytes } from 'node:crypto';
import { AppError } from '../../shared/errors';
import { hashOpaqueToken } from '../domain/hashing';
import { WORKER_SCOPES } from '../interfaces/worker-auth';
import {
  parseCrawlerProfileConfig,
  parseStorageConfig,
  type CrawlerProfileConfig,
  type StorageConfig,
} from '../domain/config';
import type {
  JobRecord,
  ScheduleRecord,
  SkippedOccurrenceRecord,
} from '../ports/crawler-unit-of-work';
import type { SecretMeta } from '../ports/config-repository';
import type { WorkerRecord } from '../ports/worker-repository';
import type { CrawlerConfigService } from './crawler-config-service';
import type { CrawlerJobService } from './crawler-job-service';
import type { CrawlerScheduleService } from './crawler-schedule-service';
import type { SecretService } from './secret-service';
import type { StorageConfigService } from './storage-config-service';
import type { YamlImportService, YamlImportPreview } from './yaml-import-service';
import type { CrawlerUnitOfWork } from '../ports/crawler-unit-of-work';
import type { WorkerRepository } from '../ports/worker-repository';

export type AdminCrawlerDashboard = Readonly<{
  workersOnline: number;
  workersTotal: number;
  jobsByStatus: Readonly<Record<string, number>>;
  activeJobs: ReadonlyArray<JobRecord>;
  overdueSchedules: ReadonlyArray<{
    scheduleId: number;
    name: string;
    nextRunAt: string;
    overduePoints: number;
  }>;
  recentErrors: ReadonlyArray<{ jobId: number; message: string; at: string }>;
}>;

export type AdminCrawlerDeps = Readonly<{
  uow: CrawlerUnitOfWork;
  jobs: CrawlerJobService;
  schedules: CrawlerScheduleService;
  profiles: CrawlerConfigService;
  storage?: StorageConfigService;
  secrets?: SecretService;
  yaml: YamlImportService;
  workers: WorkerRepository;
  /** Wall clock for online threshold (default 90s). */
  workerOnlineMs?: number;
  now?: () => Date;
}>;

/**
 * Admin-facing orchestration over crawler control-plane services.
 * Pages and Server Actions call this — never `db` / drizzle directly.
 */
export class AdminCrawlerService {
  constructor(private readonly deps: AdminCrawlerDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  async getDashboard(): Promise<AdminCrawlerDashboard> {
    const onlineThreshold = this.now().getTime() - (this.deps.workerOnlineMs ?? 90_000);
    const allWorkers = await this.listWorkers();
    const workersOnline = allWorkers.filter((w) => {
      if (!w.lastHeartbeatAt) return false;
      return new Date(w.lastHeartbeatAt).getTime() >= onlineThreshold;
    }).length;

    const statuses = [
      'queued',
      'leased',
      'running',
      'retry_wait',
      'cancel_requested',
      'succeeded',
      'partial_succeeded',
      'failed',
      'cancelled',
    ] as const;

    const jobsByStatus: Record<string, number> = {};
    for (const s of statuses) jobsByStatus[s] = 0;

    const active = await this.deps.uow.runInTransaction(async (repos) => {
      const all = await repos.jobs.listByStatuses([
        'queued',
        'leased',
        'running',
        'retry_wait',
        'cancel_requested',
        'succeeded',
        'partial_succeeded',
        'failed',
        'cancelled',
      ]);
      for (const j of all) {
        jobsByStatus[j.status] = (jobsByStatus[j.status] ?? 0) + 1;
      }
      return all
        .filter((j) =>
          ['queued', 'leased', 'running', 'retry_wait', 'cancel_requested'].includes(j.status),
        )
        .slice(0, 20);
    });

    const overdue = await this.deps.schedules.listOverdue(this.now());
    const recentErrors = await this.deps.uow.runInTransaction(async (repos) => {
      const failed = await repos.jobs.listByStatuses(['failed']);
      return failed
        .slice(-10)
        .reverse()
        .map((j) => ({
          jobId: j.id,
          message: j.progressJson ?? 'failed',
          at: j.finishedAt ?? j.updatedAt,
        }));
    });

    return {
      workersOnline,
      workersTotal: allWorkers.length,
      jobsByStatus,
      activeJobs: active,
      overdueSchedules: overdue.map((o) => ({
        scheduleId: o.scheduleId,
        name: o.name,
        nextRunAt: o.nextRunAt,
        overduePoints: o.overduePoints,
      })),
      recentErrors,
    };
  }

  async listWorkers(): Promise<ReadonlyArray<WorkerRecord>> {
    return this.deps.workers.listWorkers();
  }

  async listWorkerCredentials(workerId: number) {
    const rows = await this.deps.workers.listCredentials(workerId);
    return rows.map((row) => ({
      id: row.id,
      workerId: row.workerId,
      isRevoked: row.isRevoked,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      rotatedAt: row.rotatedAt,
    }));
  }

  async provisionWorker(name: string) {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new AppError('RESULT_INVALID', 'Worker 名称必填', 400);
    }
    if (normalizedName.length > 128) {
      throw new AppError('RESULT_INVALID', 'Worker 名称最多 128 个字符', 400);
    }
    const token = randomBytes(32).toString('base64url');
    const created = await this.deps.workers.createWorkerWithToken({
      name: normalizedName,
      tokenHash: hashOpaqueToken(token),
      scopes: WORKER_SCOPES,
      version: '1.0.0',
    });
    return {
      worker: created.worker,
      credentialId: created.credential.id,
      token,
      scopes: [...WORKER_SCOPES],
    } as const;
  }

  async setWorkerClaimEnabled(workerId: number, enabled: boolean): Promise<WorkerRecord> {
    await this.requireWorker(workerId);
    return this.deps.workers.setClaimEnabled(workerId, enabled);
  }

  async rotateWorkerCredential(workerId: number) {
    this.requireWorkerId(workerId);
    const token = randomBytes(32).toString('base64url');
    return this.deps.uow.runInTransaction(async (repos) => {
      const worker = await repos.workers.getForUpdate(workerId);
      if (!worker) throw new AppError('RESULT_INVALID', 'Worker 不存在', 404);
      const credential = await repos.workers.rotateCredential(
        workerId,
        hashOpaqueToken(token),
        WORKER_SCOPES,
      );
      return {
        workerId,
        credentialId: credential.id,
        token,
        scopes: [...WORKER_SCOPES],
      } as const;
    });
  }

  async setWorkerEnabled(workerId: number, enabled: boolean): Promise<WorkerRecord> {
    await this.requireWorker(workerId);
    return this.deps.workers.setEnabled(workerId, enabled);
  }

  private async requireWorker(workerId: number): Promise<WorkerRecord> {
    this.requireWorkerId(workerId);
    const worker = await this.deps.workers.getWorker(workerId);
    if (!worker) throw new AppError('RESULT_INVALID', 'Worker 不存在', 404);
    return worker;
  }

  private requireWorkerId(workerId: number): void {
    if (!Number.isSafeInteger(workerId) || workerId <= 0) {
      throw new AppError('RESULT_INVALID', '无效 Worker ID', 400);
    }
  }

  async revokeWorkerCredential(workerId: number, credentialId: number): Promise<void> {
    this.requireWorkerId(workerId);
    if (!Number.isSafeInteger(credentialId) || credentialId <= 0) {
      throw new AppError('RESULT_INVALID', '无效凭据 ID', 400);
    }
    await this.deps.uow.runInTransaction(async (repos) => {
      const worker = await repos.workers.getForUpdate(workerId);
      if (!worker) throw new AppError('RESULT_INVALID', 'Worker 不存在', 404);
      await repos.workers.revokeCredentialForWorker(workerId, credentialId);
    });
  }

  async listProfiles() {
    return this.deps.profiles.listProfiles();
  }

  async getProfile(profileId: number) {
    return this.deps.profiles.getProfile(profileId);
  }

  async getProfileVersion(versionId: number) {
    return this.deps.profiles.getVersion(versionId);
  }

  async createProfile(name: string, config: unknown) {
    return this.deps.profiles.createProfile(name, config);
  }

  async updateProfile(profileId: number, name: string, config: unknown) {
    return this.deps.profiles.editProfile(profileId, name, config);
  }

  async deleteProfile(profileId: number): Promise<void> {
    if (!Number.isSafeInteger(profileId) || profileId <= 0) {
      throw new AppError('RESULT_INVALID', '无效模板 ID', 400);
    }
    await this.deps.uow.runInTransaction(async (repos) => {
      const profile = await repos.profiles.getForUpdate(profileId);
      if (!profile) throw new AppError('RESULT_INVALID', '模板不存在', 404);
      await repos.schedules.disableByProfileId(profileId);
      await repos.profiles.disable(profileId);
    });
  }

  async createProfileFromParsed(name: string, config: CrawlerProfileConfig) {
    return this.deps.profiles.createProfile(name, config);
  }

  async startManualJob(input: { profileVersionId: number }): Promise<JobRecord> {
    const resolved = await this.resolveProfileSnapshot(input.profileVersionId);
    return this.deps.jobs.enqueueManual({
      kind: 'crawl',
      profileId: resolved.version.profileId,
      profileVersionId: resolved.version.id,
      storageProfileVersionId: resolved.storageProfileVersionId,
      configSnapshotJson: resolved.configSnapshotJson,
    });
  }

  private async resolveProfileSnapshot(profileVersionId: number) {
    if (!Number.isInteger(profileVersionId) || profileVersionId <= 0) {
      throw new AppError('RESULT_INVALID', '请选择有效模板', 400);
    }
    const version = await this.deps.profiles.getVersion(profileVersionId);
    if (!version) throw new AppError('RESULT_INVALID', '模板版本不存在', 404);
    const profile = await this.deps.profiles.getProfile(version.profileId);
    if (!profile?.isEnabled) {
      throw new AppError('RESULT_INVALID', '模板不存在或已删除', 404);
    }

    let storageProfileVersionId: number | null = null;
    let configSnapshot: Record<string, unknown> = {
      ...(version.config as unknown as Record<string, unknown>),
    };
    const driver = version.config.storageDriver;
    if (driver === 's3' || driver === 'sftp') {
      const storage = await this.requireStorage().findActiveByDriver(driver);
      if (!storage) {
        throw new AppError(
          'RESULT_CONFLICT',
          `模板要求 ${driver.toUpperCase()} 存储，但尚无已激活且通过 storage_test 的配置。请先在「爬虫 → 存储」创建并激活。`,
          409,
          false,
          { storageDriver: driver },
        );
      }
      storageProfileVersionId = storage.id;
      configSnapshot = {
        ...configSnapshot,
        storageProfileVersionId: storage.id,
        storageConfig: storage.config,
      };
    }
    return {
      version,
      storageProfileVersionId,
      configSnapshotJson: JSON.stringify(configSnapshot),
    };
  }

  async startProfileJob(profileVersionId: number): Promise<JobRecord> {
    return this.startManualJob({ profileVersionId });
  }

  async startStorageTestJob(input: {
    storageProfileVersionId: number;
  }): Promise<JobRecord> {
    const version = await this.requireStorage().getVersion(input.storageProfileVersionId);
    if (!version) {
      throw new AppError('RESULT_INVALID', '存储版本不存在', 404);
    }
    const snapshot = {
      kind: 'storage_test',
      storageProfileVersionId: version.id,
      storageConfig: version.config,
    };
    return this.deps.jobs.enqueueManual({
      kind: 'storage_test',
      profileId: null,
      profileVersionId: 0,
      storageProfileVersionId: input.storageProfileVersionId,
      configSnapshotJson: JSON.stringify(snapshot),
    });
  }

  async saveSchedule(
    input: Omit<Parameters<CrawlerScheduleService['create']>[0],
      'profileId' | 'storageProfileVersionId' | 'configSnapshotJson'> & {
        profileId?: number;
      },
  ): Promise<ScheduleRecord> {
    const resolved = await this.resolveProfileSnapshot(input.profileVersionId);
    if (input.profileId != null && input.profileId > 0 && input.profileId !== resolved.version.profileId) {
      throw new AppError('RESULT_INVALID', '模板 ID 与版本不匹配', 400);
    }
    return this.deps.schedules.create({
      ...input,
      profileId: resolved.version.profileId,
      profileVersionId: resolved.version.id,
      storageProfileVersionId: resolved.storageProfileVersionId,
      configSnapshotJson: resolved.configSnapshotJson,
    });
  }

  async cancelJob(jobId: number): Promise<JobRecord> {
    return this.deps.jobs.cancel(jobId);
  }

  async retryJob(jobId: number): Promise<JobRecord> {
    return this.deps.jobs.manualRetry(jobId);
  }

  async deleteJob(jobId: number): Promise<void> {
    return this.deps.jobs.deleteJob(jobId);
  }

  async purgeTerminalJobs(input: {
    olderThanDays: number;
    statuses?: readonly import('../domain/job').CrawlerJobStatus[];
    batchSize?: number;
    maxTotal?: number;
  }): Promise<{ deleted: number; truncated: boolean }> {
    return this.deps.jobs.purgeTerminalJobs(input);
  }

  async getJob(jobId: number): Promise<JobRecord | null> {
    return this.deps.uow.runInTransaction((repos) => repos.jobs.get(jobId));
  }

  async listJobs(limit = 50): Promise<ReadonlyArray<JobRecord>> {
    return this.deps.uow.runInTransaction(async (repos) => {
      const all = await repos.jobs.listByStatuses([
        'queued',
        'leased',
        'running',
        'retry_wait',
        'cancel_requested',
        'succeeded',
        'partial_succeeded',
        'failed',
        'cancelled',
      ]);
      return [...all].sort((a, b) => b.id - a.id).slice(0, limit);
    });
  }

  async listJobDetail(jobId: number) {
    return this.deps.uow.runInTransaction(async (repos) => {
      const job = await repos.jobs.get(jobId);
      if (!job) return null;
      const attempt = await repos.jobs.getCurrentAttempt(jobId);
      const items = await repos.items.listByJob(jobId);
      const events = attempt
        ? await repos.events.listByAttempt(jobId, attempt.id)
        : [];
      return { job, attempt, items, events, media: [] as const };
    });
  }

  private requireSecrets(): SecretService {
    if (!this.deps.secrets) {
      throw new AppError('CONFIG_INVALID', '精简外链采集模式未启用独立爬虫密钥库', 410);
    }
    return this.deps.secrets;
  }

  private requireStorage(): StorageConfigService {
    if (!this.deps.storage) {
      throw new AppError('CONFIG_INVALID', '精简外链采集模式未启用对象上传存储', 410);
    }
    return this.deps.storage;
  }

  async createSecret(name: string, scope: string, plaintext: string): Promise<SecretMeta> {
    return this.requireSecrets().create({ name, scope, plaintext });
  }

  async revealSecret(secretId: number) {
    return this.requireSecrets().reveal(secretId);
  }

  async listSecrets() {
    return this.requireSecrets().list();
  }

  async listStorageProfiles() {
    return this.requireStorage().listProfiles();
  }

  async listStorageVersions(profileId: number) {
    return this.requireStorage().listVersions(profileId);
  }

  async getStorageVersion(versionId: number) {
    return this.requireStorage().getVersion(versionId);
  }

  async createStorageDraft(name: string, config: unknown) {
    return this.requireStorage().createDraft(name, config);
  }

  async appendStorageDraft(profileId: number, config: unknown) {
    return this.requireStorage().appendDraft(profileId, config);
  }

  async activateStorage(versionId: number) {
    return this.requireStorage().activate(versionId);
  }

  async markStorageTestPassed(versionId: number) {
    return this.requireStorage().markStorageTestPassed(versionId);
  }

  async findActiveStorageByDriver(driver: 's3' | 'sftp') {
    return this.requireStorage().findActiveByDriver(driver);
  }

  previewYaml(raw: string): YamlImportPreview {
    return this.deps.yaml.preview(raw);
  }

  async confirmYamlImport(input: {
    name: string;
    rawYaml: string;
    nodeEnv?: string;
  }) {
    const preview = this.deps.yaml.preview(input.rawYaml, { nodeEnv: input.nodeEnv });
    this.deps.yaml.assertImportAllowed(preview);
    if (!preview.profileConfig) {
      throw new AppError('RESULT_INVALID', '无法生成模板配置', 400);
    }
    const version = await this.deps.profiles.createProfile(
      input.name,
      preview.profileConfig,
    );
    return { preview, version };
  }

  parseProfileConfig(value: unknown): CrawlerProfileConfig {
    return parseCrawlerProfileConfig(value);
  }

  parseStorage(value: unknown): StorageConfig {
    return parseStorageConfig(value);
  }

  async listSkipped(scheduleId: number): Promise<ReadonlyArray<SkippedOccurrenceRecord>> {
    return this.deps.uow.runInTransaction((repos) =>
      repos.schedules.listSkipped(scheduleId),
    );
  }
}
