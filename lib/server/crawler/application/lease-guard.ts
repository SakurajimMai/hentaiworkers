import { AppError } from '../../shared/errors';
import { hashOpaqueToken, hashesEqual } from '../domain/hashing';
import type { AttemptRecord, JobRecord } from '../ports/crawler-unit-of-work';

export type LeaseBinding = Readonly<{
  jobId: number;
  attemptId: number;
  workerId: number;
  leaseToken: string;
  now?: Date;
}>;

/** Parse ISO or MySQL DATETIME strings to epoch ms. */
export function parseTimestampMs(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const normalized = value.includes('T')
    ? value
    : value.replace(' ', 'T') + (value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value) ? '' : 'Z');
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

export function isExpiredAt(expiresAt: string | null | undefined, now: Date): boolean {
  const ms = parseTimestampMs(expiresAt);
  if (ms == null) return true;
  return ms <= now.getTime();
}

export async function assertValidLease(
  repos: {
    jobs: {
      get(jobId: number): Promise<JobRecord | null>;
      getAttempt(attemptId: number): Promise<AttemptRecord | null>;
    };
  },
  binding: LeaseBinding,
  options?: { allowCancelRequested?: boolean },
): Promise<{ job: JobRecord; attempt: AttemptRecord }> {
  const job = await repos.jobs.get(binding.jobId);
  if (!job) throw new AppError('RESULT_INVALID', '任务不存在', 404);

  const attempt = await repos.jobs.getAttempt(binding.attemptId);
  if (!attempt || attempt.jobId !== binding.jobId) {
    throw new AppError('LEASE_LOST', '租约 attempt 无效', 409);
  }
  if (attempt.workerId !== binding.workerId) {
    throw new AppError('LEASE_LOST', '租约 Worker 不匹配', 409);
  }
  if (attempt.resultStatus === 'lease_lost') {
    throw new AppError('LEASE_LOST', '租约已失效', 409);
  }

  const tokenHash = hashOpaqueToken(binding.leaseToken);
  if (!hashesEqual(tokenHash, attempt.leaseTokenHash)) {
    throw new AppError('LEASE_LOST', '租约令牌无效', 409);
  }

  const now = binding.now ?? new Date();
  if (
    isExpiredAt(attempt.leaseExpiresAt, now)
    || (job.leaseExpiresAt != null && isExpiredAt(job.leaseExpiresAt, now))
  ) {
    throw new AppError('LEASE_LOST', '租约已过期', 409);
  }

  if (job.leaseWorkerId != null && job.leaseWorkerId !== binding.workerId) {
    throw new AppError('LEASE_LOST', '任务已被其他 Worker 持有', 409);
  }

  const allowed = options?.allowCancelRequested
    ? (['leased', 'running', 'cancel_requested'] as const)
    : (['leased', 'running'] as const);

  if (!(allowed as readonly string[]).includes(job.status)) {
    throw new AppError('LEASE_LOST', '任务不在可操作租约状态', 409);
  }

  return { job, attempt };
}
