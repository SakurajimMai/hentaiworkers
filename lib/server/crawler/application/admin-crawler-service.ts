import { AppError } from '../../shared/errors';
import {
  parseCrawlerProfileConfig,
  parseStorageConfig,
  type CrawlerProfileConfig,
  type StorageConfig,
} from '../domain/config';
import type { CrawlerJobKind } from '../domain/job';
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
  storage: StorageConfigService;
  secrets: SecretService;
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

  async createProfile(name: string, config: unknown) {
    return this.deps.profiles.createProfile(name, config);
  }

  async createProfileFromParsed(name: string, config: CrawlerProfileConfig) {
    return this.deps.profiles.createProfile(name, config);
  }

  async startManualJob(input: {
    profileId: number;
    profileVersionId: number;
    configSnapshotJson: string;
    kind?: CrawlerJobKind;
    storageProfileVersionId?: number | null;
  }): Promise<JobRecord> {
    return this.deps.jobs.enqueueManual({
      kind: input.kind ?? 'crawl',
      profileId: input.profileId,
      profileVersionId: input.profileVersionId,
      storageProfileVersionId: input.storageProfileVersionId,
      configSnapshotJson: input.configSnapshotJson,
    });
  }

  async startStorageTestJob(input: {
    profileId: number;
    storageProfileVersionId: number;
    configSnapshotJson: string;
  }): Promise<JobRecord> {
    return this.deps.jobs.enqueueManual({
      kind: 'storage_test',
      profileId: input.profileId,
      profileVersionId: 0,
      storageProfileVersionId: input.storageProfileVersionId,
      configSnapshotJson: input.configSnapshotJson,
    });
  }

  async saveSchedule(input: Parameters<CrawlerScheduleService['create']>[0]): Promise<ScheduleRecord> {
    return this.deps.schedules.create(input);
  }

  async cancelJob(jobId: number): Promise<JobRecord> {
    return this.deps.jobs.cancel(jobId);
  }

  async retryJob(jobId: number): Promise<JobRecord> {
    return this.deps.jobs.manualRetry(jobId);
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
      const media = (await repos.media.listByStatus('reserved'))
        .concat(await repos.media.listByStatus('uploaded'))
        .concat(await repos.media.listByStatus('published'))
        .filter((m) => m.jobId === jobId);
      return { job, attempt, items, events, media };
    });
  }

  async createSecret(name: string, scope: string, plaintext: string): Promise<SecretMeta> {
    return this.deps.secrets.create({ name, scope, plaintext });
  }

  async revealSecret(secretId: number) {
    return this.deps.secrets.reveal(secretId);
  }

  async listSecrets() {
    return this.deps.secrets.list();
  }

  async createStorageDraft(name: string, config: unknown) {
    return this.deps.storage.createDraft(name, config);
  }

  async activateStorage(versionId: number) {
    return this.deps.storage.activate(versionId);
  }

  async markStorageTestPassed(versionId: number) {
    return this.deps.storage.markStorageTestPassed(versionId);
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
