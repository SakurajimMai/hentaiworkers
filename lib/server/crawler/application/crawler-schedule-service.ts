import { AppError } from '../../shared/errors';
import {
  computeNextRunAt,
  countOverduePoints,
  DEFAULT_CATCH_UP_LIMIT,
  isValidIanaTimezone,
  shouldMaterializeOccurrence,
  validateScheduleDefinition,
  type MisfirePolicy,
  type OverlapPolicy,
  type ScheduleDefinition,
  type ScheduleKind,
} from '../domain/schedule';
import { isTerminalJobStatus } from '../domain/job';
import type {
  CrawlerRepositories,
  CrawlerUnitOfWork,
  JobRecord,
  ScheduleRecord,
  SkippedOccurrenceRecord,
} from '../ports/crawler-unit-of-work';

export type OverdueScheduleView = Readonly<{
  scheduleId: number;
  name: string;
  nextRunAt: string;
  overduePoints: number;
  misfirePolicy: MisfirePolicy;
  status: 'overdue_awaiting_claim';
}>;

export type CreateScheduleInput = ScheduleDefinition & Readonly<{
  profileId: number;
  profileVersionId: number;
  name: string;
  configSnapshotJson: string;
  nextRunAt?: string | null;
  isEnabled?: boolean;
}>;

const EXECUTING: ReadonlySet<string> = new Set([
  'leased',
  'running',
  'cancel_requested',
]);

export class CrawlerScheduleService {
  constructor(private readonly uow: CrawlerUnitOfWork) {}

  async create(input: CreateScheduleInput): Promise<ScheduleRecord> {
    const errors = validateScheduleDefinition(input);
    if (errors.length) {
      throw new AppError('RESULT_INVALID', errors.join('; '), 400, false, { errors });
    }
    if (!input.name.trim()) {
      throw new AppError('RESULT_INVALID', '调度名称必填', 400);
    }
    if (!Number.isFinite(input.profileVersionId) || input.profileVersionId < 1) {
      throw new AppError('RESULT_INVALID', 'profileVersionId 必填且 >= 1', 400);
    }

    const initialNext = input.nextRunAt
      ?? (input.kind === 'manual'
        ? null
        : computeNextRunAt({
          kind: input.kind,
          cron: input.cron,
          intervalSeconds: input.intervalSeconds,
          timezone: input.timezone,
          from: new Date(),
        })?.toISOString() ?? null);

    return this.uow.runInTransaction(async (repos) =>
      repos.schedules.create({
        profileId: input.profileId,
        profileVersionId: input.profileVersionId,
        name: input.name.trim(),
        kind: input.kind,
        cronExpression: input.cron ?? null,
        intervalSeconds: input.intervalSeconds ?? null,
        timezone: input.timezone,
        overlapPolicy: input.overlapPolicy,
        misfirePolicy: input.misfirePolicy,
        catchUpLimit: input.catchUpLimit,
        maxActiveJobs: input.maxActiveJobs,
        isEnabled: input.isEnabled ?? true,
        nextRunAt: initialNext,
        configSnapshotJson: input.configSnapshotJson,
      }),
    );
  }

  async listOverdue(now: Date = new Date()): Promise<ReadonlyArray<OverdueScheduleView>> {
    return this.uow.runInTransaction(async (repos) => {
      const due = await repos.schedules.listEnabledDue(now.toISOString());
      return due.map((schedule) => {
        const overduePoints = countOverduePoints({
          nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt) : null,
          now,
          kind: schedule.kind,
          intervalSeconds: schedule.intervalSeconds ?? undefined,
          misfirePolicy: schedule.misfirePolicy,
          catchUpLimit: schedule.catchUpLimit,
        });
        return {
          scheduleId: schedule.id,
          name: schedule.name,
          nextRunAt: schedule.nextRunAt!,
          overduePoints,
          misfirePolicy: schedule.misfirePolicy,
          status: 'overdue_awaiting_claim' as const,
        };
      }).filter((row) => row.overduePoints > 0);
    });
  }

  /**
   * Materialize due schedule points inside a claim transaction.
   * Returns jobs created in this pass (may be empty under skip policy).
   */
  async materializeDueSchedules(
    repos: CrawlerRepositories,
    now: Date,
  ): Promise<{ created: JobRecord[]; skipped: SkippedOccurrenceRecord[] }> {
    const created: JobRecord[] = [];
    const skipped: SkippedOccurrenceRecord[] = [];
    const due = await repos.schedules.listEnabledDue(now.toISOString());

    for (const schedule of due) {
      const profileJobs = await repos.jobs.listByProfile(schedule.profileId);
      const nonTerminal = profileJobs.filter((j) => !isTerminalJobStatus(j.status));
      const executing = nonTerminal.filter((j) => EXECUTING.has(j.status));

      const overdueCount = countOverduePoints({
        nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt) : null,
        now,
        kind: schedule.kind,
        intervalSeconds: schedule.intervalSeconds ?? undefined,
        misfirePolicy: schedule.misfirePolicy,
        catchUpLimit: schedule.catchUpLimit,
      });

      if (overdueCount <= 0) continue;

      const points = buildScheduledForPoints(
        schedule,
        now,
        overdueCount,
      );

      for (const scheduledFor of points) {
        const decision = shouldMaterializeOccurrence({
          executingJobs: executing.length + created.filter(
            (j) => j.profileId === schedule.profileId && EXECUTING.has(j.status),
          ).length,
          nonTerminalJobs:
            nonTerminal.length
            + created.filter((j) => j.profileId === schedule.profileId).length,
          maxActiveJobs: schedule.maxActiveJobs,
          overlapPolicy: schedule.overlapPolicy,
        });

        if (decision === 'skip_event') {
          const row = await repos.schedules.recordSkipped({
            scheduleId: schedule.id,
            scheduledFor,
            reason: `overlap_policy=${schedule.overlapPolicy}`,
          });
          skipped.push(row);
          continue;
        }

        try {
          const job = await repos.jobs.create({
            kind: 'crawl',
            profileId: schedule.profileId,
            profileVersionId: schedule.profileVersionId,
            scheduleId: schedule.id,
            scheduledFor,
            configSnapshotJson: schedule.configSnapshotJson,
          });
          created.push(job);
        } catch (error) {
          if (error instanceof AppError && error.code === 'RESULT_CONFLICT') {
            // Unique (schedule_id, scheduled_for) — already materialized.
            continue;
          }
          throw error;
        }
      }

      const nextRun = computeNextRunAt({
        kind: schedule.kind,
        cron: schedule.cronExpression ?? undefined,
        intervalSeconds: schedule.intervalSeconds ?? undefined,
        timezone: schedule.timezone,
        from: now,
      });

      await repos.schedules.update(schedule.id, {
        nextRunAt: nextRun?.toISOString() ?? null,
        lastMaterializedAt: now.toISOString(),
      });
    }

    return { created, skipped };
  }
}

function buildScheduledForPoints(
  schedule: ScheduleRecord,
  now: Date,
  count: number,
): string[] {
  const points: string[] = [];
  const base = schedule.nextRunAt ? new Date(schedule.nextRunAt) : now;
  for (let i = 0; i < count; i++) {
    if (schedule.kind === 'interval' && schedule.intervalSeconds) {
      const t = new Date(base.getTime() + i * schedule.intervalSeconds * 1000);
      // Do not schedule future points beyond now for catch-up.
      if (t.getTime() > now.getTime()) break;
      points.push(t.toISOString());
    } else {
      // latest_only / single wall-clock point: use nextRunAt then now offsets
      if (i === 0 && schedule.nextRunAt) {
        points.push(schedule.nextRunAt);
      } else {
        points.push(new Date(base.getTime() + i * 60_000).toISOString());
      }
    }
  }
  // latest_only already capped by count; ensure uniqueness
  return [...new Set(points)];
}

export type {
  ScheduleDefinition,
  ScheduleKind,
  OverlapPolicy,
  MisfirePolicy,
};

export { isValidIanaTimezone, DEFAULT_CATCH_UP_LIMIT };
