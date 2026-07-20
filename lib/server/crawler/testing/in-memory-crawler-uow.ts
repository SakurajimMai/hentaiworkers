import { AppError } from '../../shared/errors';
import type { CrawlerJobStatus } from '../domain/job';
import type {
  AttemptRecord,
  CrawlerJobRepository,
  CrawlerProfileLifecycleRepository,
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
} from '../ports/crawler-unit-of-work';
import type { WorkerTransactionalRepository } from '../ports/worker-repository';
import { hashesEqual } from '../domain/hashing';
import type { InMemoryCrawlerProfileState } from './in-memory-config-repos';

function nowIso(): string {
  return new Date().toISOString();
}

function cloneJob(job: JobRecord): JobRecord {
  return { ...job };
}

class InMemoryCrawlerProfileLifecycleRepository
  implements CrawlerProfileLifecycleRepository {
  constructor(
    private readonly state?: InMemoryCrawlerProfileState,
  ) {}

  async getForUpdate(profileId: number) {
    if (!this.state) return { id: profileId, isEnabled: true };
    const profile = this.state.profiles.get(profileId);
    return profile ? { id: profileId, isEnabled: profile.isEnabled } : null;
  }

  async disable(profileId: number): Promise<void> {
    if (!this.state) return;
    const profile = this.state.profiles.get(profileId);
    if (!profile) throw new AppError('RESULT_INVALID', '模板不存在', 404);
    if (profile.isEnabled) {
      this.state.profiles.set(profileId, { ...profile, isEnabled: false });
    }
  }
}

export class InMemoryCrawlerScheduleRepository implements CrawlerScheduleRepository {
  private seq = 1;
  private skipSeq = 1;
  readonly rows = new Map<number, ScheduleRecord>();
  readonly skipped: SkippedOccurrenceRecord[] = [];

  async create(
    input: Omit<ScheduleRecord, 'id' | 'lastMaterializedAt'> & {
      lastMaterializedAt?: string | null;
    },
  ): Promise<ScheduleRecord> {
    const row: ScheduleRecord = {
      ...input,
      id: this.seq++,
      lastMaterializedAt: input.lastMaterializedAt ?? null,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async update(scheduleId: number, patch: Partial<ScheduleRecord>): Promise<ScheduleRecord> {
    const current = this.rows.get(scheduleId);
    if (!current) throw new AppError('RESULT_INVALID', '调度不存在', 404);
    const next = { ...current, ...patch, id: scheduleId };
    this.rows.set(scheduleId, next);
    return next;
  }

  async disableByProfileId(profileId: number): Promise<number> {
    let disabled = 0;
    for (const [scheduleId, schedule] of this.rows) {
      if (schedule.profileId !== profileId || !schedule.isEnabled) continue;
      this.rows.set(scheduleId, { ...schedule, isEnabled: false });
      disabled += 1;
    }
    return disabled;
  }

  async get(scheduleId: number): Promise<ScheduleRecord | null> {
    return this.rows.get(scheduleId) ?? null;
  }

  async listEnabledDue(nowIsoValue: string): Promise<ReadonlyArray<ScheduleRecord>> {
    return [...this.rows.values()].filter(
      (s) => s.isEnabled && s.nextRunAt != null && s.nextRunAt <= nowIsoValue,
    );
  }

  async listEnabled(): Promise<ReadonlyArray<ScheduleRecord>> {
    return [...this.rows.values()].filter((s) => s.isEnabled);
  }

  async listSkipped(scheduleId: number): Promise<ReadonlyArray<SkippedOccurrenceRecord>> {
    return this.skipped.filter((s) => s.scheduleId === scheduleId);
  }

  async recordSkipped(input: {
    scheduleId: number;
    scheduledFor: string;
    reason: string;
  }): Promise<SkippedOccurrenceRecord> {
    const row: SkippedOccurrenceRecord = {
      id: this.skipSeq++,
      scheduleId: input.scheduleId,
      scheduledFor: input.scheduledFor,
      reason: input.reason,
      createdAt: nowIso(),
    };
    this.skipped.push(row);
    return row;
  }
}

export class InMemoryCrawlerJobRepository implements CrawlerJobRepository {
  private jobSeq = 1;
  private attemptSeq = 1;
  readonly jobs = new Map<number, JobRecord>();
  readonly attempts = new Map<number, AttemptRecord>();
  /** Unique (scheduleId, scheduledFor) guard */
  private readonly scheduleKeys = new Set<string>();

  constructor(private readonly deleteSiblingRows: (jobId: number) => void = () => undefined) {}

  async create(input: {
    kind: JobRecord['kind'];
    profileId: number | null;
    profileVersionId: number;
    storageProfileVersionId?: number | null;
    scheduleId?: number | null;
    scheduledFor?: string | null;
    configSnapshotJson: string;
    maxAttempts?: number;
    retryOfJobId?: number | null;
  }): Promise<JobRecord> {
    if (input.scheduleId != null && input.scheduledFor) {
      const key = `${input.scheduleId}|${input.scheduledFor}`;
      if (this.scheduleKeys.has(key)) {
        throw new AppError('RESULT_CONFLICT', '调度计划点已物化', 409);
      }
      this.scheduleKeys.add(key);
    }
    const ts = nowIso();
    const row: JobRecord = {
      id: this.jobSeq++,
      kind: input.kind,
      status: 'queued',
      profileId: input.profileId,
      profileVersionId: input.profileVersionId,
      storageProfileVersionId: input.storageProfileVersionId ?? null,
      scheduleId: input.scheduleId ?? null,
      scheduledFor: input.scheduledFor ?? null,
      configSnapshotJson: input.configSnapshotJson,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      leaseWorkerId: null,
      leaseExpiresAt: null,
      progressJson: null,
      retryOfJobId: input.retryOfJobId ?? null,
      nextRetryAt: null,
      createdAt: ts,
      updatedAt: ts,
      startedAt: null,
      finishedAt: null,
    };
    this.jobs.set(row.id, row);
    return cloneJob(row);
  }

  async get(jobId: number): Promise<JobRecord | null> {
    const row = this.jobs.get(jobId);
    return row ? cloneJob(row) : null;
  }

  async getForUpdate(jobId: number): Promise<JobRecord | null> {
    return this.get(jobId);
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
    const current = this.jobs.get(input.jobId);
    if (!current) return null;
    if (!input.expectedStatuses.includes(current.status)) return null;
    const next: JobRecord = {
      ...current,
      ...input.patch,
      status: input.nextStatus,
      updatedAt: nowIso(),
    };
    this.jobs.set(input.jobId, next);
    return cloneJob(next);
  }

  async listQueued(limit: number): Promise<ReadonlyArray<JobRecord>> {
    return [...this.jobs.values()]
      .filter((j) => j.status === 'queued')
      .sort((a, b) => a.id - b.id)
      .slice(0, limit)
      .map(cloneJob);
  }

  async listByProfile(profileId: number): Promise<ReadonlyArray<JobRecord>> {
    return [...this.jobs.values()].filter((j) => j.profileId === profileId).map(cloneJob);
  }

  async listByStatuses(
    statuses: readonly CrawlerJobStatus[],
  ): Promise<ReadonlyArray<JobRecord>> {
    const set = new Set(statuses);
    return [...this.jobs.values()].filter((j) => set.has(j.status)).map(cloneJob);
  }

  async deleteCascade(jobId: number): Promise<boolean> {
    if (!this.jobs.has(jobId)) return false;
    for (const [id, job] of this.jobs) {
      if (job.retryOfJobId === jobId) {
        this.jobs.set(id, { ...job, retryOfJobId: null, updatedAt: nowIso() });
      }
    }
    for (const [id, attempt] of [...this.attempts.entries()]) {
      if (attempt.jobId === jobId) this.attempts.delete(id);
    }
    this.deleteSiblingRows(jobId);
    this.jobs.delete(jobId);
    return true;
  }

  async deleteTerminalOlderThan(input: {
    olderThanIso: string;
    statuses: readonly CrawlerJobStatus[];
    limit?: number;
  }): Promise<number> {
    const set = new Set(input.statuses);
    const cutoff = Date.parse(input.olderThanIso);
    const limit = Math.min(500, Math.max(1, input.limit ?? 100));
    const candidates = [...this.jobs.values()]
      .filter((j) => set.has(j.status))
      .filter((j) => Date.parse(j.finishedAt ?? j.createdAt) < cutoff)
      .sort(
        (a, b) =>
          Date.parse(a.finishedAt ?? a.createdAt) - Date.parse(b.finishedAt ?? b.createdAt),
      )
      .slice(0, limit);
    let removed = 0;
    for (const job of candidates) {
      if (await this.deleteCascade(job.id)) removed += 1;
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
    const row: AttemptRecord = {
      id: this.attemptSeq++,
      jobId: input.jobId,
      attemptNo: input.attemptNo,
      workerId: input.workerId,
      leaseTokenHash: new Uint8Array(input.leaseTokenHash),
      leaseExpiresAt: input.leaseExpiresAt,
      startedAt: nowIso(),
      finishedAt: null,
      resultStatus: 'running',
      errorCode: null,
      errorMessage: null,
    };
    this.attempts.set(row.id, row);
    return { ...row, leaseTokenHash: new Uint8Array(row.leaseTokenHash) };
  }

  async getAttempt(attemptId: number): Promise<AttemptRecord | null> {
    const row = this.attempts.get(attemptId);
    return row
      ? { ...row, leaseTokenHash: new Uint8Array(row.leaseTokenHash) }
      : null;
  }

  async getCurrentAttempt(jobId: number): Promise<AttemptRecord | null> {
    const rows = [...this.attempts.values()]
      .filter((a) => a.jobId === jobId)
      .sort((a, b) => b.attemptNo - a.attemptNo);
    const row = rows[0];
    return row
      ? { ...row, leaseTokenHash: new Uint8Array(row.leaseTokenHash) }
      : null;
  }

  async updateAttempt(
    attemptId: number,
    patch: Partial<Pick<AttemptRecord, 'leaseExpiresAt' | 'finishedAt' | 'resultStatus' | 'errorCode' | 'errorMessage'>>,
  ): Promise<AttemptRecord> {
    const current = this.attempts.get(attemptId);
    if (!current) throw new AppError('RESULT_INVALID', 'attempt 不存在', 404);
    const next = { ...current, ...patch };
    this.attempts.set(attemptId, next);
    return { ...next, leaseTokenHash: new Uint8Array(next.leaseTokenHash) };
  }
}

export class InMemoryOperationReceiptRepository implements OperationReceiptRepository {
  private seq = 1;
  readonly rows: OperationReceiptRecord[] = [];

  async find(
    operationScope: string,
    idempotencyKeyHash: Uint8Array,
  ): Promise<OperationReceiptRecord | null> {
    return (
      this.rows.find(
        (r) =>
          r.operationScope === operationScope
          && hashesEqual(r.idempotencyKeyHash, idempotencyKeyHash),
      ) ?? null
    );
  }

  deleteByJob(jobId: number, itemIds: ReadonlySet<number>): void {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      const receipt = this.rows[index];
      if (receipt.jobId === jobId || (receipt.itemId != null && itemIds.has(receipt.itemId))) {
        this.rows.splice(index, 1);
      }
    }
  }

  async save(input: {
    operationScope: string;
    idempotencyKeyHash: Uint8Array;
    jobId: number | null;
    itemId: number | null;
    requestHash: Uint8Array;
    responseJson: string;
  }): Promise<OperationReceiptRecord> {
    const existing = await this.find(input.operationScope, input.idempotencyKeyHash);
    if (existing) {
      throw new AppError('RESULT_CONFLICT', '幂等键已存在', 409);
    }
    const row: OperationReceiptRecord = {
      id: this.seq++,
      operationScope: input.operationScope,
      idempotencyKeyHash: new Uint8Array(input.idempotencyKeyHash),
      jobId: input.jobId,
      itemId: input.itemId,
      requestHash: new Uint8Array(input.requestHash),
      responseJson: input.responseJson,
      createdAt: nowIso(),
    };
    this.rows.push(row);
    return row;
  }
}

export class InMemoryJobItemRepository implements JobItemRepository {
  private seq = 1;
  readonly rows = new Map<number, JobItemRecord>();
  private readonly uniq = new Map<string, number>();

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
    const key = `${input.jobId}|${input.source}|${input.sourceId}`;
    const existingId = this.uniq.get(key);
    if (existingId != null) {
      const current = this.rows.get(existingId)!;
      const next: JobItemRecord = {
        ...current,
        stage: input.stage,
        status: input.status,
        animeId: input.animeId ?? current.animeId,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      };
      this.rows.set(existingId, next);
      return next;
    }
    const row: JobItemRecord = {
      id: this.seq++,
      jobId: input.jobId,
      source: input.source,
      sourceId: input.sourceId,
      stage: input.stage,
      status: input.status,
      animeId: input.animeId ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    };
    this.rows.set(row.id, row);
    this.uniq.set(key, row.id);
    return row;
  }

  deleteByJob(jobId: number): void {
    for (const [id, item] of this.rows) {
      if (item.jobId !== jobId) continue;
      this.rows.delete(id);
      this.uniq.delete(`${item.jobId}|${item.source}|${item.sourceId}`);
    }
  }

  async listByJob(jobId: number): Promise<ReadonlyArray<JobItemRecord>> {
    return [...this.rows.values()].filter((r) => r.jobId === jobId);
  }

  async get(itemId: number): Promise<JobItemRecord | null> {
    return this.rows.get(itemId) ?? null;
  }
}

export class InMemoryJobEventRepository implements JobEventRepository {
  private seq = 1;
  readonly rows: JobEventRecord[] = [];
  private readonly uniq = new Set<string>();

  async append(input: {
    jobId: number;
    attemptId: number | null;
    sequence: number;
    level: JobEventRecord['level'];
    eventType: string;
    message?: string | null;
    payloadJson?: string | null;
  }): Promise<JobEventRecord> {
    const key = `${input.jobId}|${input.attemptId ?? 'null'}|${input.sequence}`;
    if (this.uniq.has(key)) {
      throw new AppError('RESULT_CONFLICT', '事件序号重复', 409);
    }
    this.uniq.add(key);
    const row: JobEventRecord = {
      id: this.seq++,
      jobId: input.jobId,
      attemptId: input.attemptId,
      sequence: input.sequence,
      level: input.level,
      eventType: input.eventType,
      message: input.message ?? null,
      payloadJson: input.payloadJson ?? null,
      createdAt: nowIso(),
    };
    this.rows.push(row);
    return row;
  }

  deleteByJob(jobId: number): void {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      const event = this.rows[index];
      if (event.jobId !== jobId) continue;
      this.rows.splice(index, 1);
      this.uniq.delete(`${event.jobId}|${event.attemptId ?? 'null'}|${event.sequence}`);
    }
  }

  async listByAttempt(
    jobId: number,
    attemptId: number,
  ): Promise<ReadonlyArray<JobEventRecord>> {
    return this.rows.filter((r) => r.jobId === jobId && r.attemptId === attemptId);
  }
}

export class InMemoryMediaUploadRepository implements MediaUploadRepository {
  private seq = 1;
  readonly rows = new Map<number, MediaUploadRecord>();
  private readonly stagingKeys = new Set<string>();

  async reserve(input: {
    jobId: number;
    attemptId: number;
    itemId: number | null;
    stagingKey: string;
    finalKey: string;
  }): Promise<MediaUploadRecord> {
    if (this.stagingKeys.has(input.stagingKey)) {
      throw new AppError('RESULT_CONFLICT', 'staging key 已预留', 409);
    }
    this.stagingKeys.add(input.stagingKey);
    const ts = nowIso();
    const row: MediaUploadRecord = {
      id: this.seq++,
      jobId: input.jobId,
      attemptId: input.attemptId,
      itemId: input.itemId,
      stagingKey: input.stagingKey,
      finalKey: input.finalKey,
      status: 'reserved',
      createdAt: ts,
      updatedAt: ts,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async get(id: number): Promise<MediaUploadRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async listByStatus(
    status: MediaUploadRecord['status'],
  ): Promise<ReadonlyArray<MediaUploadRecord>> {
    return [...this.rows.values()].filter((r) => r.status === status);
  }

  async markStatus(
    id: number,
    status: MediaUploadRecord['status'],
  ): Promise<MediaUploadRecord> {
    const current = this.rows.get(id);
    if (!current) throw new AppError('RESULT_INVALID', '媒体预留不存在', 404);
    const next = { ...current, status, updatedAt: nowIso() };
    this.rows.set(id, next);
    return next;
  }

  async listExpiredReserved(beforeIso: string): Promise<ReadonlyArray<MediaUploadRecord>> {
    return [...this.rows.values()].filter(
      (r) => r.status === 'reserved' && r.createdAt < beforeIso,
    );
  }

  deleteByJob(jobId: number): void {
    for (const [id, upload] of this.rows) {
      if (upload.jobId !== jobId) continue;
      this.rows.delete(id);
      this.stagingKeys.delete(upload.stagingKey);
    }
  }
}

export class InMemoryCrawlerUnitOfWork implements CrawlerUnitOfWork {
  readonly workers: WorkerTransactionalRepository;
  readonly profiles: InMemoryCrawlerProfileLifecycleRepository;
  readonly schedules = new InMemoryCrawlerScheduleRepository();
  readonly receipts = new InMemoryOperationReceiptRepository();
  readonly items = new InMemoryJobItemRepository();
  readonly events = new InMemoryJobEventRepository();
  readonly media = new InMemoryMediaUploadRepository();
  readonly jobs = new InMemoryCrawlerJobRepository((jobId) => {
    const itemIds = new Set(
      [...this.items.rows.values()]
        .filter((item) => item.jobId === jobId)
        .map((item) => item.id),
    );
    this.receipts.deleteByJob(jobId, itemIds);
    this.media.deleteByJob(jobId);
    this.items.deleteByJob(jobId);
    this.events.deleteByJob(jobId);
  });

  constructor(
    profileState?: InMemoryCrawlerProfileState,
    workers: WorkerTransactionalRepository = {
      async getForUpdate(workerId: number) {
        return { id: workerId, isEnabled: true, claimEnabled: true };
      },
      async rotateCredential() {
        throw new AppError('RESULT_INVALID', '测试 UOW 未配置 Worker 仓储', 500);
      },
      async revokeCredentialForWorker() {
        throw new AppError('RESULT_INVALID', '测试 UOW 未配置 Worker 仓储', 500);
      },
    },
  ) {
    this.profiles = new InMemoryCrawlerProfileLifecycleRepository(profileState);
    this.workers = workers;
  }

  private chain: Promise<unknown> = Promise.resolve();

  get repos(): CrawlerRepositories {
    return {
      workers: this.workers,
      profiles: this.profiles,
      schedules: this.schedules,
      jobs: this.jobs,
      receipts: this.receipts,
      items: this.items,
      events: this.events,
      media: this.media,
    };
  }

  /**
   * Serialize transactions to simulate row locks / CAS under concurrency.
   */
  runInTransaction<T>(fn: (repos: CrawlerRepositories) => Promise<T>): Promise<T> {
    const run = this.chain.then(() => fn(this.repos));
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
