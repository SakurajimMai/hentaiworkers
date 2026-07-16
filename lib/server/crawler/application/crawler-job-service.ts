import { AppError } from '../../shared/errors';
import {
  createManualRetrySeed,
  isDeletableJobStatus,
  isTerminalJobStatus,
  resolveFinalStatus,
  TERMINAL_JOB_STATUSES,
  transitionJobStatus,
  type CrawlerJobKind,
  type CrawlerJobStatus,
} from '../domain/job';
import {
  generateLeaseToken,
  hashOpaqueToken,
} from '../domain/hashing';
import {
  evaluateJobCompatibility,
  parseJobRequirements,
  type WorkerCapabilities,
} from '../domain/worker-protocol';
import type {
  AttemptRecord,
  CrawlerUnitOfWork,
  JobRecord,
} from '../ports/crawler-unit-of-work';
import { CrawlerScheduleService } from './crawler-schedule-service';
import { assertValidLease, isExpiredAt, type LeaseBinding } from './lease-guard';
import { withOperationReceipt } from './operation-receipts';

const DEFAULT_RETRY_BACKOFF_MS = 30_000;

export type ClaimedJob = Readonly<{
  job: JobRecord;
  attempt: AttemptRecord;
  /** Plaintext lease token — returned once; only hash is stored. */
  leaseToken: string;
}>;

export type { LeaseBinding };

/**
 * Lease TTL must outlive cold Next.js route compiles + MacCMS network retries.
 * Worker job heartbeats renew the lease; 5 minutes gives headroom when a single
 * commit/request stalls without losing the job to expireStaleLeases.
 */
const DEFAULT_LEASE_TTL_MS = 300_000;

export class CrawlerJobService {
  private readonly schedules: CrawlerScheduleService;

  constructor(
    private readonly uow: CrawlerUnitOfWork,
    private readonly leaseTtlMs = DEFAULT_LEASE_TTL_MS,
  ) {
    this.schedules = new CrawlerScheduleService(uow);
  }

  async enqueueManual(input: {
    kind?: CrawlerJobKind;
    profileId: number;
    profileVersionId: number;
    storageProfileVersionId?: number | null;
    configSnapshotJson: string;
    maxAttempts?: number;
  }): Promise<JobRecord> {
    return this.uow.runInTransaction((repos) =>
      repos.jobs.create({
        kind: input.kind ?? 'crawl',
        profileId: input.profileId,
        profileVersionId: input.profileVersionId,
        storageProfileVersionId: input.storageProfileVersionId,
        configSnapshotJson: input.configSnapshotJson,
        maxAttempts: input.maxAttempts,
      }),
    );
  }

  /**
   * Claim path: materialize due schedules, then CAS one queued job to leased
   * and create a bound attempt with hashed lease token.
   * Incompatible jobs remain queued; a progress reason is recorded for admins.
   */
  async claimForWorker(input: {
    workerId: number;
    now?: Date;
    leaseTtlMs?: number;
    capabilities?: WorkerCapabilities;
    /** Long-poll wait (ms), capped at 20s by API layer. */
    waitMs?: number;
  }): Promise<ClaimedJob | null> {
    const deadline = (input.now ?? new Date()).getTime() + Math.max(0, input.waitMs ?? 0);
    let now = input.now ?? new Date();

    for (;;) {
      const claimed = await this.claimOnce({
        workerId: input.workerId,
        now,
        leaseTtlMs: input.leaseTtlMs,
        capabilities: input.capabilities,
      });
      if (claimed) return claimed;
      if (Date.now() >= deadline) return null;
      await new Promise((r) => setTimeout(r, 250));
      now = new Date();
    }
  }

  private async claimOnce(input: {
    workerId: number;
    now: Date;
    leaseTtlMs?: number;
    capabilities?: WorkerCapabilities;
  }): Promise<ClaimedJob | null> {
    const now = input.now;
    const ttl = input.leaseTtlMs ?? this.leaseTtlMs;

    return this.uow.runInTransaction(async (repos) => {
      // Nested transaction serialization: expire + promote + materialize + claim.
      await this.expireStaleLeasesInRepos(repos, now);
      await this.promoteReadyRetriesInRepos(repos, now);
      await this.schedules.materializeDueSchedules(repos, now);

      const queued = await repos.jobs.listQueued(32);
      for (const candidate of queued) {
        if (input.capabilities) {
          const requirements = parseJobRequirements(candidate.configSnapshotJson);
          const fit = evaluateJobCompatibility(requirements, input.capabilities);
          if (!fit.ok) {
            await repos.jobs.casStatus({
              jobId: candidate.id,
              expectedStatuses: ['queued'],
              nextStatus: 'queued',
              patch: {
                progressJson: JSON.stringify({
                  claimSkipReason: fit.reason,
                  skippedAt: now.toISOString(),
                  skippedByWorkerId: input.workerId,
                }),
              },
            });
            continue;
          }
        }

        const leaseToken = generateLeaseToken();
        const leaseTokenHash = hashOpaqueToken(leaseToken);
        const leaseExpiresAt = new Date(now.getTime() + ttl).toISOString();
        const nextAttemptNo = candidate.attemptCount + 1;

        const claimed = await repos.jobs.casStatus({
          jobId: candidate.id,
          expectedStatuses: ['queued'],
          nextStatus: 'leased',
          patch: {
            leaseWorkerId: input.workerId,
            leaseExpiresAt,
            attemptCount: nextAttemptNo,
            progressJson: null,
            nextRetryAt: null,
          },
        });
        if (!claimed) continue;

        const attempt = await repos.jobs.createAttempt({
          jobId: claimed.id,
          attemptNo: nextAttemptNo,
          workerId: input.workerId,
          leaseTokenHash,
          leaseExpiresAt,
        });

        return { job: claimed, attempt, leaseToken };
      }
      return null;
    });
  }

  async start(binding: LeaseBinding): Promise<JobRecord> {
    return this.uow.runInTransaction(async (repos) => {
      await assertValidLease(repos, binding);
      const job = await repos.jobs.get(binding.jobId);
      if (!job) throw new AppError('RESULT_INVALID', '任务不存在', 404);

      const transition = transitionJobStatus(job.status, { type: 'start' });
      if (!transition.ok) {
        throw new AppError('RESULT_CONFLICT', '无法启动任务', 409, false, {
          reason: transition.reason,
          status: job.status,
        });
      }

      const updated = await repos.jobs.casStatus({
        jobId: binding.jobId,
        expectedStatuses: ['leased'],
        nextStatus: 'running',
        patch: { startedAt: (binding.now ?? new Date()).toISOString() },
      });
      if (!updated) {
        throw new AppError('RESULT_CONFLICT', '启动任务状态冲突', 409);
      }
      return updated;
    });
  }

  async heartbeat(binding: LeaseBinding & { leaseTtlMs?: number }): Promise<{
    job: JobRecord;
    cancelRequested: boolean;
    leaseExpiresAt: string;
  }> {
    return this.uow.runInTransaction(async (repos) => {
      await assertValidLease(repos, binding, { allowCancelRequested: true });
      const job = await repos.jobs.get(binding.jobId);
      if (!job) throw new AppError('RESULT_INVALID', '任务不存在', 404);

      const ttl = binding.leaseTtlMs ?? this.leaseTtlMs;
      const leaseExpiresAt = new Date(
        (binding.now ?? new Date()).getTime() + ttl,
      ).toISOString();

      await repos.jobs.updateAttempt(binding.attemptId, { leaseExpiresAt });
      const updated = await repos.jobs.casStatus({
        jobId: binding.jobId,
        expectedStatuses: [job.status],
        nextStatus: job.status,
        patch: {
          leaseWorkerId: binding.workerId,
          leaseExpiresAt,
        },
      });

      return {
        job: updated ?? job,
        cancelRequested: job.status === 'cancel_requested',
        leaseExpiresAt,
      };
    });
  }

  async cancel(jobId: number): Promise<JobRecord> {
    return this.uow.runInTransaction(async (repos) => {
      const job = await repos.jobs.get(jobId);
      if (!job) throw new AppError('RESULT_INVALID', '任务不存在', 404);

      const transition = transitionJobStatus(job.status, { type: 'cancel' });
      if (!transition.ok) {
        throw new AppError('RESULT_CONFLICT', '无法取消任务', 409, false, {
          reason: transition.reason,
          status: job.status,
        });
      }

      const updated = await repos.jobs.casStatus({
        jobId,
        expectedStatuses: [job.status],
        nextStatus: transition.status,
        patch: isTerminalJobStatus(transition.status)
          ? { finishedAt: new Date().toISOString(), leaseWorkerId: null, leaseExpiresAt: null }
          : undefined,
      });
      if (!updated) {
        throw new AppError('RESULT_CONFLICT', '取消任务状态冲突', 409);
      }
      return updated;
    });
  }

  async complete(input: LeaseBinding & {
    outcome: 'succeeded' | 'partial_succeeded' | 'failed';
    idempotencyKey: string;
    succeededItems?: number;
    failedItems?: number;
    continueOnError?: boolean;
  }): Promise<{ replayed: boolean; job: JobRecord }> {
    return this.uow.runInTransaction(async (repos) => {
      const requestBody = {
        outcome: input.outcome,
        succeededItems: input.succeededItems ?? 0,
        failedItems: input.failedItems ?? 0,
      };

      const receipt = await withOperationReceipt({
        receipts: repos.receipts,
        operationScope: `job.complete:${input.jobId}`,
        idempotencyKey: input.idempotencyKey,
        jobId: input.jobId,
        requestBody,
        execute: async () => {
          // Allow cancel_requested so transition can return CANCELLED conflict cleanly.
          await assertValidLease(repos, input, { allowCancelRequested: true });
          const job = await repos.jobs.get(input.jobId);
          if (!job) throw new AppError('RESULT_INVALID', '任务不存在', 404);

          let outcome = input.outcome;
          if (
            input.succeededItems != null
            && input.failedItems != null
            && input.continueOnError != null
          ) {
            outcome = resolveFinalStatus({
              continueOnError: input.continueOnError,
              succeededItems: input.succeededItems,
              failedItems: input.failedItems,
            }) as 'succeeded' | 'partial_succeeded' | 'failed';
          }

          const transition = transitionJobStatus(job.status, {
            type: 'complete',
            outcome,
          });
          if (!transition.ok) {
            throw new AppError(
              transition.reason === 'conflict' ? 'CANCELLED' : 'RESULT_CONFLICT',
              transition.reason === 'conflict'
                ? '任务已请求取消，拒绝完成'
                : '无法完成任务',
              409,
              false,
              { reason: transition.reason, status: job.status },
            );
          }

          const updated = await repos.jobs.casStatus({
            jobId: input.jobId,
            expectedStatuses: ['running'],
            nextStatus: transition.status,
            patch: {
              finishedAt: (input.now ?? new Date()).toISOString(),
              leaseWorkerId: null,
              leaseExpiresAt: null,
            },
          });
          if (!updated) {
            throw new AppError('RESULT_CONFLICT', '完成任务状态冲突', 409);
          }

          await repos.jobs.updateAttempt(input.attemptId, {
            finishedAt: updated.finishedAt,
            resultStatus: transition.status as AttemptRecord['resultStatus'],
          });

          return { job: updated };
        },
      });

      return { replayed: receipt.replayed, job: receipt.body.job };
    });
  }

  async fail(input: LeaseBinding & {
    idempotencyKey: string;
    retryable: boolean;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<{ replayed: boolean; job: JobRecord }> {
    return this.uow.runInTransaction(async (repos) => {
      const requestBody = {
        retryable: input.retryable,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      };

      const receipt = await withOperationReceipt({
        receipts: repos.receipts,
        operationScope: `job.fail:${input.jobId}`,
        idempotencyKey: input.idempotencyKey,
        jobId: input.jobId,
        requestBody,
        execute: async () => {
          await assertValidLease(repos, input, { allowCancelRequested: true });
          const job = await repos.jobs.get(input.jobId);
          if (!job) throw new AppError('RESULT_INVALID', '任务不存在', 404);

          const retriesRemaining = Math.max(0, job.maxAttempts - job.attemptCount);
          const transition = transitionJobStatus(job.status, {
            type: 'fail',
            retryable: input.retryable,
            retriesRemaining,
          });
          if (!transition.ok) {
            throw new AppError(
              transition.reason === 'conflict' ? 'CANCELLED' : 'RESULT_CONFLICT',
              '无法标记失败',
              409,
              false,
              { reason: transition.reason },
            );
          }

          const now = input.now ?? new Date();
          const patch =
            transition.status === 'retry_wait'
              ? {
                leaseWorkerId: null as number | null,
                leaseExpiresAt: null as string | null,
                nextRetryAt: new Date(now.getTime() + DEFAULT_RETRY_BACKOFF_MS).toISOString(),
              }
              : isTerminalJobStatus(transition.status)
                ? {
                  finishedAt: now.toISOString(),
                  leaseWorkerId: null as number | null,
                  leaseExpiresAt: null as string | null,
                  nextRetryAt: null as string | null,
                }
                : {
                  leaseWorkerId: null as number | null,
                  leaseExpiresAt: null as string | null,
                };

          const updated = await repos.jobs.casStatus({
            jobId: input.jobId,
            expectedStatuses: [job.status],
            nextStatus: transition.status,
            patch,
          });
          if (!updated) {
            throw new AppError('RESULT_CONFLICT', '失败状态冲突', 409);
          }

          await repos.jobs.updateAttempt(input.attemptId, {
            finishedAt: now.toISOString(),
            resultStatus:
              transition.status === 'retry_wait'
                ? 'failed'
                : (transition.status as AttemptRecord['resultStatus']),
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage ?? null,
          });

          return { job: updated };
        },
      });

      return { replayed: receipt.replayed, job: receipt.body.job };
    });
  }

  /**
   * Worker acknowledges cancel_requested and moves job to cancelled.
   */
  async cancelAck(binding: LeaseBinding): Promise<JobRecord> {
    return this.uow.runInTransaction(async (repos) => {
      await assertValidLease(repos, binding, { allowCancelRequested: true });
      const job = await repos.jobs.get(binding.jobId);
      if (!job) throw new AppError('RESULT_INVALID', '任务不存在', 404);

      const transition = transitionJobStatus(job.status, { type: 'cancel_ack' });
      if (!transition.ok) {
        throw new AppError('RESULT_CONFLICT', '无法确认取消', 409, false, {
          reason: transition.reason,
          status: job.status,
        });
      }

      const updated = await repos.jobs.casStatus({
        jobId: binding.jobId,
        expectedStatuses: ['cancel_requested'],
        nextStatus: 'cancelled',
        patch: {
          finishedAt: (binding.now ?? new Date()).toISOString(),
          leaseWorkerId: null,
          leaseExpiresAt: null,
        },
      });
      if (!updated) {
        throw new AppError('RESULT_CONFLICT', '取消确认冲突', 409);
      }
      await repos.jobs.updateAttempt(binding.attemptId, {
        finishedAt: updated.finishedAt,
        resultStatus: 'cancelled',
      });
      return updated;
    });
  }

  /**
   * Expire leases: cancel_requested -> cancelled; otherwise requeue or fail.
   * Late submissions with the old token fail assertValidLease with LEASE_LOST.
   */
  async expireStaleLeases(now: Date = new Date()): Promise<number> {
    return this.uow.runInTransaction((repos) => this.expireStaleLeasesInRepos(repos, now));
  }

  private async expireStaleLeasesInRepos(
    repos: {
      jobs: {
        listByStatuses(statuses: readonly CrawlerJobStatus[]): Promise<ReadonlyArray<JobRecord>>;
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
        getCurrentAttempt(jobId: number): Promise<AttemptRecord | null>;
        updateAttempt(
          attemptId: number,
          patch: Partial<Pick<AttemptRecord, 'leaseExpiresAt' | 'finishedAt' | 'resultStatus'>>,
        ): Promise<AttemptRecord>;
      };
    },
    now: Date,
  ): Promise<number> {
    const active = await repos.jobs.listByStatuses([
      'leased',
      'running',
      'cancel_requested',
    ]);
    let count = 0;
    for (const job of active) {
      if (!job.leaseExpiresAt || !isExpiredAt(job.leaseExpiresAt, now)) {
        continue;
      }
      const retriesRemaining = Math.max(0, job.maxAttempts - job.attemptCount);
      const transition = transitionJobStatus(job.status, {
        type: 'lease_expire',
        retriesRemaining,
      });
      if (!transition.ok) continue;

      const updated = await repos.jobs.casStatus({
        jobId: job.id,
        expectedStatuses: [job.status],
        nextStatus: transition.status,
        patch: {
          leaseWorkerId: null,
          leaseExpiresAt: null,
          finishedAt: isTerminalJobStatus(transition.status)
            ? now.toISOString()
            : null,
          nextRetryAt:
            transition.status === 'queued'
              ? null
              : job.nextRetryAt,
        },
      });
      if (!updated) continue;

      const attempt = await repos.jobs.getCurrentAttempt(job.id);
      if (attempt && attempt.resultStatus === 'running') {
        await repos.jobs.updateAttempt(attempt.id, {
          finishedAt: now.toISOString(),
          resultStatus: 'lease_lost',
        });
      }
      count += 1;
    }
    return count;
  }

  private async promoteReadyRetriesInRepos(
    repos: {
      jobs: {
        listByStatuses(statuses: readonly CrawlerJobStatus[]): Promise<ReadonlyArray<JobRecord>>;
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
      };
    },
    now: Date,
  ): Promise<number> {
    const waiting = await repos.jobs.listByStatuses(['retry_wait']);
    let count = 0;
    for (const job of waiting) {
      // Ready when nextRetryAt is unset or already in the past.
      if (job.nextRetryAt && !isExpiredAt(job.nextRetryAt, now)) {
        continue;
      }
      const transition = transitionJobStatus(job.status, { type: 'retry_ready' });
      if (!transition.ok) continue;
      const updated = await repos.jobs.casStatus({
        jobId: job.id,
        expectedStatuses: ['retry_wait'],
        nextStatus: 'queued',
        patch: { nextRetryAt: null },
      });
      if (updated) count += 1;
    }
    return count;
  }

  async manualRetry(jobId: number): Promise<JobRecord> {
    return this.uow.runInTransaction(async (repos) => {
      const job = await repos.jobs.getForUpdate(jobId);
      if (!job) throw new AppError('RESULT_INVALID', '任务不存在', 404);
      const seed = createManualRetrySeed({
        status: job.status,
        kind: job.kind,
        profileVersionId: job.profileVersionId,
        configSnapshotJson: job.configSnapshotJson,
        maxAttempts: job.maxAttempts,
        jobId: job.id,
      });
      return repos.jobs.create({
        kind: seed.kind,
        profileId: job.profileId,
        profileVersionId: seed.profileVersionId,
        storageProfileVersionId: job.storageProfileVersionId,
        configSnapshotJson: seed.configSnapshotJson,
        maxAttempts: seed.maxAttempts,
        retryOfJobId: seed.retryOfJobId,
      });
    });
  }

  /**
   * Hard-delete a terminal job and related control-plane rows.
   * Running / queued jobs must be cancelled first.
   */
  async deleteJob(jobId: number): Promise<void> {
    return this.uow.runInTransaction(async (repos) => {
      const job = await repos.jobs.getForUpdate(jobId);
      if (!job) throw new AppError('RESULT_INVALID', '任务不存在', 404);
      if (!isDeletableJobStatus(job.status)) {
        throw new AppError(
          'RESULT_CONFLICT',
          '仅可删除已结束的任务（成功/失败/取消）。运行中的请先取消。',
          409,
          false,
          { status: job.status },
        );
      }
      const ok = await repos.jobs.deleteCascade(jobId);
      if (!ok) throw new AppError('RESULT_INVALID', '任务删除失败', 500);
    });
  }

  /**
   * Purge terminal jobs whose finished_at/created_at is older than `olderThanDays`.
   * Runs bounded batches in separate transactions and reports when the defensive
   * total cap may have left matching rows behind.
   */
  async purgeTerminalJobs(input: {
    olderThanDays: number;
    statuses?: readonly CrawlerJobStatus[];
    batchSize?: number;
    maxTotal?: number;
  }): Promise<{ deleted: number; truncated: boolean }> {
    const days = Math.floor(input.olderThanDays);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      throw new AppError('RESULT_INVALID', '保留天数须在 1–3650 之间', 400);
    }
    const statuses = input.statuses?.length ? input.statuses : TERMINAL_JOB_STATUSES;
    if (!statuses.length || statuses.some((status) => !isDeletableJobStatus(status))) {
      throw new AppError('RESULT_INVALID', '仅可清理终态任务', 400);
    }

    const batchSize = Math.min(500, Math.max(1, Math.floor(input.batchSize ?? 200)));
    const maxTotal = Math.min(100_000, Math.max(1, Math.floor(input.maxTotal ?? 10_000)));
    const olderThanIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    let deleted = 0;

    while (deleted < maxTotal) {
      const limit = Math.min(batchSize, maxTotal - deleted);
      const batchDeleted = await this.uow.runInTransaction((repos) =>
        repos.jobs.deleteTerminalOlderThan({ olderThanIso, statuses, limit }),
      );
      if (batchDeleted <= 0) return { deleted, truncated: false };
      deleted += batchDeleted;
      if (batchDeleted < limit) return { deleted, truncated: false };
    }

    return { deleted, truncated: true };
  }
}

export type { CrawlerJobStatus };
