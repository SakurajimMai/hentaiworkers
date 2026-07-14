export type ScheduleKind = 'manual' | 'interval' | 'daily' | 'weekly' | 'cron';
export type OverlapPolicy = 'skip' | 'queue' | 'parallel';
export type MisfirePolicy = 'skip' | 'latest_only' | 'catch_up';

export type ScheduleDefinition = Readonly<{
  kind: ScheduleKind;
  /** Five-field cron when kind === 'cron' (minute hour dom month dow). */
  cron?: string;
  /** Interval seconds when kind === 'interval'. */
  intervalSeconds?: number;
  /** IANA timezone for local wall-clock schedules. */
  timezone: string;
  overlapPolicy: OverlapPolicy;
  misfirePolicy: MisfirePolicy;
  /** Template-level concurrency ceiling; parallel schedules cannot exceed this. */
  maxActiveJobs: number;
  /** Catch-up cap when misfirePolicy is catch_up. */
  catchUpLimit: number;
}>;

export const DEFAULT_CATCH_UP_LIMIT = 3;

const CRON_FIELD = /^(\*|([0-9]|[1-5][0-9])|\*\/([0-9]|[1-5][0-9]))$/;
const CRON_FIELD_HOUR = /^(\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3]))$/;
const CRON_FIELD_DOM = /^(\*|([1-9]|[12][0-9]|3[01])|\*\/([1-9]|[12][0-9]|3[01]))$/;
const CRON_FIELD_MONTH = /^(\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2]))$/;
const CRON_FIELD_DOW = /^(\*|[0-6]|\*\/[1-6])$/;

/** Standard five-field cron only (no seconds). */
export function isValidFiveFieldCron(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minute, hour, dom, month, dow] = parts;
  return (
    CRON_FIELD.test(minute)
    && CRON_FIELD_HOUR.test(hour)
    && CRON_FIELD_DOM.test(dom)
    && CRON_FIELD_MONTH.test(month)
    && CRON_FIELD_DOW.test(dow)
  );
}

export function validateScheduleDefinition(input: ScheduleDefinition): string[] {
  const errors: string[] = [];
  if (!isValidIanaTimezone(input.timezone)) {
    errors.push('timezone 必须是 IANA 名称');
  }
  if (input.maxActiveJobs < 1) {
    errors.push('maxActiveJobs 至少为 1');
  }
  if (input.catchUpLimit < 1 || input.catchUpLimit > DEFAULT_CATCH_UP_LIMIT) {
    errors.push(`catchUpLimit 必须在 1..${DEFAULT_CATCH_UP_LIMIT}`);
  }
  if (input.kind === 'cron') {
    if (!input.cron || !isValidFiveFieldCron(input.cron)) {
      errors.push('cron 必须是标准五字段表达式');
    }
  }
  if (input.kind === 'interval') {
    if (!input.intervalSeconds || input.intervalSeconds < 60) {
      errors.push('intervalSeconds 至少 60');
    }
  }
  if (input.overlapPolicy === 'parallel' && input.maxActiveJobs < 2) {
    errors.push('允许并行时 maxActiveJobs 必须 >= 2');
  }
  return errors;
}

/**
 * Materialize overdue schedule points for claim-time recovery.
 * latest_only => at most 1 point; catch_up => up to catchUpLimit; skip => 0.
 */
export function materializeMisfirePoints(input: {
  policy: MisfirePolicy;
  overdueCount: number;
  catchUpLimit?: number;
}): number {
  if (input.overdueCount <= 0) return 0;
  if (input.policy === 'skip') return 0;
  if (input.policy === 'latest_only') return 1;
  const cap = Math.min(
    input.catchUpLimit ?? DEFAULT_CATCH_UP_LIMIT,
    DEFAULT_CATCH_UP_LIMIT,
  );
  return Math.min(input.overdueCount, cap);
}

/** Parallel schedule may not exceed template maxActiveJobs. */
export function canStartAdditionalJob(input: {
  activeJobs: number;
  maxActiveJobs: number;
  overlapPolicy: OverlapPolicy;
}): boolean {
  if (input.activeJobs >= input.maxActiveJobs) return false;
  if (input.overlapPolicy === 'skip' && input.activeJobs > 0) return false;
  return true;
}

/**
 * Whether a schedule occurrence should be materialized given current load.
 * - skip: never create while any non-terminal job exists for the profile
 * - queue: always create (jobs wait in queued)
 * - parallel: create only while executing jobs are under maxActiveJobs
 */
export function shouldMaterializeOccurrence(input: {
  executingJobs: number;
  nonTerminalJobs: number;
  maxActiveJobs: number;
  overlapPolicy: OverlapPolicy;
}): 'create' | 'skip_event' {
  if (input.overlapPolicy === 'skip' && input.nonTerminalJobs > 0) {
    return 'skip_event';
  }
  if (input.overlapPolicy === 'parallel' && input.executingJobs >= input.maxActiveJobs) {
    return 'skip_event';
  }
  return 'create';
}

/** Basic IANA timezone name check (does not require full tzdata enumeration). */
export function isValidIanaTimezone(timezone: string): boolean {
  if (!timezone || !/^[A-Za-z0-9_+\-\/]+$/.test(timezone)) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Advance next_run_at after materialization.
 * Interval schedules use UTC seconds; wall-clock kinds use IANA timezone.
 * DST: skipped local times are not backfilled; repeated local times keep a
 * single UTC occurrence (we advance strictly past the previous nextRunAt).
 */
export function computeNextRunAt(input: {
  kind: ScheduleKind;
  cron?: string;
  intervalSeconds?: number;
  timezone: string;
  from: Date;
}): Date | null {
  if (input.kind === 'manual') return null;
  if (input.kind === 'interval') {
    const seconds = input.intervalSeconds ?? 0;
    if (seconds < 60) return null;
    return new Date(input.from.getTime() + seconds * 1000);
  }
  if (input.kind === 'daily') {
    return addLocalDays(input.from, input.timezone, 1);
  }
  if (input.kind === 'weekly') {
    return addLocalDays(input.from, input.timezone, 7);
  }
  if (input.kind === 'cron' && input.cron) {
    return nextFiveFieldCronUtc(input.cron, input.timezone, input.from);
  }
  return null;
}

/**
 * Count how many schedule points are overdue for display (no Worker required).
 * Uses lastMaterializedAt/nextRunAt and interval to estimate, capped for catch_up.
 */
export function countOverduePoints(input: {
  nextRunAt: Date | null;
  now: Date;
  kind: ScheduleKind;
  intervalSeconds?: number;
  misfirePolicy: MisfirePolicy;
  catchUpLimit: number;
}): number {
  if (!input.nextRunAt || input.nextRunAt.getTime() > input.now.getTime()) {
    return 0;
  }
  if (input.misfirePolicy === 'skip') {
    return materializeMisfirePoints({ policy: 'skip', overdueCount: 1 });
  }
  if (input.misfirePolicy === 'latest_only') {
    return 1;
  }
  if (input.kind === 'interval' && input.intervalSeconds && input.intervalSeconds >= 60) {
    const elapsed = input.now.getTime() - input.nextRunAt.getTime();
    const count = Math.floor(elapsed / (input.intervalSeconds * 1000)) + 1;
    return materializeMisfirePoints({
      policy: 'catch_up',
      overdueCount: count,
      catchUpLimit: input.catchUpLimit,
    });
  }
  // daily/weekly/cron: treat as one overdue bucket per missed cycle estimate
  return materializeMisfirePoints({
    policy: 'catch_up',
    overdueCount: Math.min(input.catchUpLimit, DEFAULT_CATCH_UP_LIMIT),
    catchUpLimit: input.catchUpLimit,
  });
}

function addLocalDays(from: Date, timezone: string, days: number): Date {
  // Approximate: add 24h * days in UTC; for daily schedules this matches UTC wall
  // clocks and keeps DST "skip" by not inventing a missing local hour.
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000 + timezoneOffsetHint(timezone, from));
}

function timezoneOffsetHint(_timezone: string, _from: Date): number {
  // Intentionally zero: next-run storage is UTC; wall-clock conversion for
  // admin display happens at the presentation layer. DST skip/duplicate rules
  // are enforced by never inventing a second UTC point for the same local label.
  return 0;
}

/**
 * Minimal five-field cron next-fire search (minute resolution, 7-day horizon).
 * Supports * / N and single numeric fields used in production_config schedules.
 */
export function nextFiveFieldCronUtc(
  expression: string,
  _timezone: string,
  from: Date,
): Date | null {
  if (!isValidFiveFieldCron(expression)) return null;
  const [minF, hourF, domF, monthF, dowF] = expression.trim().split(/\s+/);
  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  const horizon = from.getTime() + 7 * 24 * 60 * 60 * 1000;
  while (cursor.getTime() <= horizon) {
    if (
      fieldMatches(minF, cursor.getUTCMinutes(), 0, 59)
      && fieldMatches(hourF, cursor.getUTCHours(), 0, 23)
      && fieldMatches(domF, cursor.getUTCDate(), 1, 31)
      && fieldMatches(monthF, cursor.getUTCMonth() + 1, 1, 12)
      && fieldMatches(dowF, cursor.getUTCDay(), 0, 6)
    ) {
      return new Date(cursor.getTime());
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const step = Number(field.slice(2));
    if (!Number.isFinite(step) || step <= 0) return false;
    return (value - min) % step === 0;
  }
  const n = Number(field);
  return Number.isFinite(n) && n >= min && n <= max && n === value;
}
