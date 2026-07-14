export const CRAWLER_JOB_STATUSES = [
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

export type CrawlerJobStatus = (typeof CRAWLER_JOB_STATUSES)[number];

export const CRAWLER_JOB_KINDS = ['crawl', 'storage_test', 'cleanup'] as const;
export type CrawlerJobKind = (typeof CRAWLER_JOB_KINDS)[number];

export const TERMINAL_JOB_STATUSES = [
  'succeeded',
  'partial_succeeded',
  'failed',
  'cancelled',
] as const satisfies readonly CrawlerJobStatus[];

const TERMINAL = new Set<string>(TERMINAL_JOB_STATUSES);

export type JobTransitionEvent =
  | { type: 'claim' }
  | { type: 'start' }
  | { type: 'succeed' }
  | { type: 'partial_succeed' }
  | { type: 'fail'; retryable: boolean; retriesRemaining: number }
  | { type: 'retry_ready' }
  | { type: 'cancel' }
  | { type: 'cancel_ack' }
  | { type: 'lease_expire'; retriesRemaining: number }
  /** Completion attempted while status may already be cancel_requested. */
  | { type: 'complete'; outcome: 'succeeded' | 'partial_succeeded' | 'failed' };

export type JobTransitionFailureReason =
  | 'terminal'
  | 'invalid'
  | 'conflict';

export type JobTransitionResult =
  | { ok: true; status: CrawlerJobStatus }
  | { ok: false; reason: JobTransitionFailureReason };

export function isTerminalJobStatus(status: CrawlerJobStatus): boolean {
  return TERMINAL.has(status);
}

/**
 * Pure job status transition rules from the control-plane design.
 * Callers must apply updates with optimistic status conditions to win races.
 */
export function transitionJobStatus(
  current: CrawlerJobStatus,
  event: JobTransitionEvent,
): JobTransitionResult {
  if (isTerminalJobStatus(current)) {
    return { ok: false, reason: 'terminal' };
  }

  switch (event.type) {
    case 'claim':
      return current === 'queued'
        ? { ok: true, status: 'leased' }
        : { ok: false, reason: 'invalid' };

    case 'start':
      return current === 'leased'
        ? { ok: true, status: 'running' }
        : { ok: false, reason: 'invalid' };

    case 'succeed':
      return current === 'running'
        ? { ok: true, status: 'succeeded' }
        : current === 'cancel_requested'
          ? { ok: false, reason: 'conflict' }
          : { ok: false, reason: 'invalid' };

    case 'partial_succeed':
      return current === 'running'
        ? { ok: true, status: 'partial_succeeded' }
        : current === 'cancel_requested'
          ? { ok: false, reason: 'conflict' }
          : { ok: false, reason: 'invalid' };

    case 'complete':
      if (current === 'cancel_requested') {
        return { ok: false, reason: 'conflict' };
      }
      if (current !== 'running') {
        return { ok: false, reason: 'invalid' };
      }
      return { ok: true, status: event.outcome };

    case 'fail':
      if (current === 'cancel_requested') {
        return { ok: false, reason: 'conflict' };
      }
      if (current !== 'running' && current !== 'leased') {
        return { ok: false, reason: 'invalid' };
      }
      if (event.retryable && event.retriesRemaining > 0) {
        return { ok: true, status: 'retry_wait' };
      }
      return { ok: true, status: 'failed' };

    case 'retry_ready':
      return current === 'retry_wait'
        ? { ok: true, status: 'queued' }
        : { ok: false, reason: 'invalid' };

    case 'cancel':
      if (current === 'queued' || current === 'retry_wait') {
        return { ok: true, status: 'cancelled' };
      }
      if (current === 'leased' || current === 'running') {
        return { ok: true, status: 'cancel_requested' };
      }
      return { ok: false, reason: 'invalid' };

    case 'cancel_ack':
      return current === 'cancel_requested'
        ? { ok: true, status: 'cancelled' }
        : { ok: false, reason: 'invalid' };

    case 'lease_expire':
      if (current === 'cancel_requested') {
        return { ok: true, status: 'cancelled' };
      }
      if (current !== 'leased' && current !== 'running') {
        return { ok: false, reason: 'invalid' };
      }
      if (event.retriesRemaining > 0) {
        return { ok: true, status: 'queued' };
      }
      return { ok: true, status: 'failed' };

    default:
      return { ok: false, reason: 'invalid' };
  }
}

export type RetryJobSeed = Readonly<{
  kind: CrawlerJobKind;
  profileVersionId: number;
  configSnapshotJson: string;
  maxAttempts: number;
  retryOfJobId: number;
}>;

/** Manual retry creates a new linked job; terminal jobs are not reopened. */
export function createManualRetrySeed(input: {
  status: CrawlerJobStatus;
  kind: CrawlerJobKind;
  profileVersionId: number;
  configSnapshotJson: string;
  maxAttempts: number;
  jobId: number;
}): RetryJobSeed {
  if (!isTerminalJobStatus(input.status)) {
    throw new Error('只有终态任务可以手动重试');
  }
  return {
    kind: input.kind,
    profileVersionId: input.profileVersionId,
    configSnapshotJson: input.configSnapshotJson,
    maxAttempts: input.maxAttempts,
    retryOfJobId: input.jobId,
  };
}

export function resolveFinalStatus(input: {
  continueOnError: boolean;
  succeededItems: number;
  failedItems: number;
}): CrawlerJobStatus {
  if (input.failedItems <= 0) return 'succeeded';
  if (input.continueOnError && input.succeededItems > 0) return 'partial_succeeded';
  return 'failed';
}
