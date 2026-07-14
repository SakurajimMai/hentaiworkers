import { AppError } from '../../shared/errors';
import type { CrawlerJobStatus } from '../domain/job';
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
} from '../ports/crawler-unit-of-work';
import { hashesEqual } from '../domain/hashing';

function nowIso(): string {
  return new Date().toISOString();
}

function cloneJob(job: JobRecord): JobRecord {
  return { ...job };
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

  async create(input: {
    kind: JobRecord['kind'];
    profileId: number;
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
    patch: Partial<Pick<AttemptRecord, 'leaseExpiresAt' | 'finishedAt' | 'resultStatus'>>,
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
}

export class InMemoryCrawlerUnitOfWork implements CrawlerUnitOfWork {
  readonly schedules = new InMemoryCrawlerScheduleRepository();
  readonly jobs = new InMemoryCrawlerJobRepository();
  readonly receipts = new InMemoryOperationReceiptRepository();
  readonly items = new InMemoryJobItemRepository();
  readonly events = new InMemoryJobEventRepository();
  readonly media = new InMemoryMediaUploadRepository();

  private chain: Promise<unknown> = Promise.resolve();

  get repos(): CrawlerRepositories {
    return {
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
