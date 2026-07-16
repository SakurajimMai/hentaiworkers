import type { CrawlerJobKind, CrawlerJobStatus } from '../domain/job';
import type {
  MisfirePolicy,
  OverlapPolicy,
  ScheduleKind,
} from '../domain/schedule';

export type ScheduleRecord = Readonly<{
  id: number;
  profileId: number;
  profileVersionId: number;
  storageProfileVersionId: number | null;
  name: string;
  kind: ScheduleKind;
  cronExpression: string | null;
  intervalSeconds: number | null;
  timezone: string;
  overlapPolicy: OverlapPolicy;
  misfirePolicy: MisfirePolicy;
  catchUpLimit: number;
  maxActiveJobs: number;
  isEnabled: boolean;
  nextRunAt: string | null;
  lastMaterializedAt: string | null;
  configSnapshotJson: string;
}>;

export type JobRecord = Readonly<{
  id: number;
  kind: CrawlerJobKind;
  status: CrawlerJobStatus;
  profileId: number;
  profileVersionId: number;
  storageProfileVersionId: number | null;
  scheduleId: number | null;
  scheduledFor: string | null;
  configSnapshotJson: string;
  attemptCount: number;
  maxAttempts: number;
  leaseWorkerId: number | null;
  leaseExpiresAt: string | null;
  progressJson: string | null;
  retryOfJobId: number | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}>;

export type AttemptRecord = Readonly<{
  id: number;
  jobId: number;
  attemptNo: number;
  workerId: number;
  leaseTokenHash: Uint8Array;
  leaseExpiresAt: string;
  startedAt: string;
  finishedAt: string | null;
  resultStatus:
    | 'running'
    | 'succeeded'
    | 'partial_succeeded'
    | 'failed'
    | 'cancelled'
    | 'lease_lost';
  errorCode: string | null;
  errorMessage: string | null;
}>;

export type OperationReceiptRecord = Readonly<{
  id: number;
  operationScope: string;
  idempotencyKeyHash: Uint8Array;
  jobId: number | null;
  itemId: number | null;
  requestHash: Uint8Array;
  responseJson: string;
  createdAt: string;
}>;

export type JobItemRecord = Readonly<{
  id: number;
  jobId: number;
  source: string;
  sourceId: string;
  stage: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';
  animeId: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}>;

export type JobEventRecord = Readonly<{
  id: number;
  jobId: number;
  attemptId: number | null;
  sequence: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  eventType: string;
  message: string | null;
  payloadJson: string | null;
  createdAt: string;
}>;

export type MediaUploadRecord = Readonly<{
  id: number;
  jobId: number;
  attemptId: number;
  itemId: number | null;
  stagingKey: string;
  finalKey: string;
  status: 'reserved' | 'uploaded' | 'published' | 'abandoned' | 'cleaned';
  createdAt: string;
  updatedAt: string;
}>;

export type SkippedOccurrenceRecord = Readonly<{
  id: number;
  scheduleId: number;
  scheduledFor: string;
  reason: string;
  createdAt: string;
}>;

export interface CrawlerScheduleRepository {
  create(input: Omit<ScheduleRecord, 'id' | 'lastMaterializedAt'> & {
    lastMaterializedAt?: string | null;
  }): Promise<ScheduleRecord>;
  update(scheduleId: number, patch: Partial<ScheduleRecord>): Promise<ScheduleRecord>;
  get(scheduleId: number): Promise<ScheduleRecord | null>;
  listEnabledDue(nowIso: string): Promise<ReadonlyArray<ScheduleRecord>>;
  listEnabled(): Promise<ReadonlyArray<ScheduleRecord>>;
  listSkipped(scheduleId: number): Promise<ReadonlyArray<SkippedOccurrenceRecord>>;
  recordSkipped(input: {
    scheduleId: number;
    scheduledFor: string;
    reason: string;
  }): Promise<SkippedOccurrenceRecord>;
}

export interface CrawlerJobRepository {
  create(input: {
    kind: CrawlerJobKind;
    profileId: number;
    profileVersionId: number;
    storageProfileVersionId?: number | null;
    scheduleId?: number | null;
    scheduledFor?: string | null;
    configSnapshotJson: string;
    maxAttempts?: number;
    retryOfJobId?: number | null;
  }): Promise<JobRecord>;
  get(jobId: number): Promise<JobRecord | null>;
  /** Lock a job row for the remainder of the current transaction. */
  getForUpdate(jobId: number): Promise<JobRecord | null>;
  /**
   * Compare-and-set status transition. Returns updated row or null if predicate failed.
   */
  casStatus(input: {
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
  }): Promise<JobRecord | null>;
  listQueued(limit: number): Promise<ReadonlyArray<JobRecord>>;
  listByProfile(profileId: number): Promise<ReadonlyArray<JobRecord>>;
  listByStatuses(
    statuses: readonly CrawlerJobStatus[],
  ): Promise<ReadonlyArray<JobRecord>>;
  /**
   * Hard-delete a job and its child control-plane rows (items/attempts/events/receipts).
   * Does not touch catalog tables (animes / anime_works).
   */
  deleteCascade(jobId: number): Promise<boolean>;
  /**
   * Hard-delete terminal jobs older than the given ISO cutoff (by finished_at, else created_at).
   * Returns number of jobs removed.
   */
  deleteTerminalOlderThan(input: {
    olderThanIso: string;
    statuses: readonly CrawlerJobStatus[];
    limit?: number;
  }): Promise<number>;
  createAttempt(input: {
    jobId: number;
    attemptNo: number;
    workerId: number;
    leaseTokenHash: Uint8Array;
    leaseExpiresAt: string;
  }): Promise<AttemptRecord>;
  getAttempt(attemptId: number): Promise<AttemptRecord | null>;
  getCurrentAttempt(jobId: number): Promise<AttemptRecord | null>;
  updateAttempt(
    attemptId: number,
    patch: Partial<Pick<AttemptRecord, 'leaseExpiresAt' | 'finishedAt' | 'resultStatus' | 'errorCode' | 'errorMessage'>>,
  ): Promise<AttemptRecord>;
}

export interface OperationReceiptRepository {
  find(
    operationScope: string,
    idempotencyKeyHash: Uint8Array,
  ): Promise<OperationReceiptRecord | null>;
  save(input: {
    operationScope: string;
    idempotencyKeyHash: Uint8Array;
    jobId: number | null;
    itemId: number | null;
    requestHash: Uint8Array;
    responseJson: string;
  }): Promise<OperationReceiptRecord>;
}

export interface JobItemRepository {
  upsert(input: {
    jobId: number;
    source: string;
    sourceId: string;
    stage: string;
    status: JobItemRecord['status'];
    animeId?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<JobItemRecord>;
  listByJob(jobId: number): Promise<ReadonlyArray<JobItemRecord>>;
  get(itemId: number): Promise<JobItemRecord | null>;
}

export interface JobEventRepository {
  append(input: {
    jobId: number;
    attemptId: number | null;
    sequence: number;
    level: JobEventRecord['level'];
    eventType: string;
    message?: string | null;
    payloadJson?: string | null;
  }): Promise<JobEventRecord>;
  listByAttempt(jobId: number, attemptId: number): Promise<ReadonlyArray<JobEventRecord>>;
}

export interface MediaUploadRepository {
  reserve(input: {
    jobId: number;
    attemptId: number;
    itemId: number | null;
    stagingKey: string;
    finalKey: string;
  }): Promise<MediaUploadRecord>;
  get(id: number): Promise<MediaUploadRecord | null>;
  listByStatus(status: MediaUploadRecord['status']): Promise<ReadonlyArray<MediaUploadRecord>>;
  markStatus(id: number, status: MediaUploadRecord['status']): Promise<MediaUploadRecord>;
  listExpiredReserved(beforeIso: string): Promise<ReadonlyArray<MediaUploadRecord>>;
}

/**
 * Unit of work for multi-step claim/materialize operations.
 * In-memory implementation runs the callback under a mutex.
 */
export interface CrawlerUnitOfWork {
  runInTransaction<T>(fn: (repos: CrawlerRepositories) => Promise<T>): Promise<T>;
}

export type CrawlerRepositories = Readonly<{
  schedules: CrawlerScheduleRepository;
  jobs: CrawlerJobRepository;
  receipts: OperationReceiptRepository;
  items: JobItemRepository;
  events: JobEventRepository;
  media: MediaUploadRepository;
}>;
