import { AppError } from '../../shared/errors';
import type { IdentityService } from './identity-service';
import type {
  UpsertWatchProgressInput,
  WatchProgressAnimeItem,
  WatchProgressRecord,
  WatchProgressRepository,
} from '../ports/watch-progress-repository';
import type { UserEventsRepository } from '../ports/user-events-repository';

const COMPLETE_RATIO = 0.9;
const COMPLETE_REMAINING_SECONDS = 5;
const MAX_LIST = 100;
const MAX_POSITION = 24 * 60 * 60;

export type WatchClientEvent =
  | 'play_start'
  | 'play_progress'
  | 'play_25_percent'
  | 'play_50_percent'
  | 'play_75_percent'
  | 'play_complete'
  | 'pause'
  | null;

export type WatchProgressWriteBody = Readonly<{
  positionSeconds: number;
  durationSeconds?: number;
  completed?: boolean;
  force?: boolean;
  clientEvent?: WatchClientEvent;
}>;

export function deriveCompleted(input: {
  positionSeconds: number;
  durationSeconds: number;
  completed?: boolean;
}): boolean {
  if (input.completed === true) return true;
  const duration = Math.max(0, input.durationSeconds);
  const position = Math.max(0, input.positionSeconds);
  if (duration <= 0) return false;
  if (position / duration >= COMPLETE_RATIO) return true;
  if (duration - position <= COMPLETE_REMAINING_SECONDS) return true;
  return false;
}

export class WatchProgressService {
  constructor(
    private readonly progress: WatchProgressRepository,
    private readonly identity: IdentityService,
    private readonly events?: UserEventsRepository,
  ) {}

  async listMine(limit = 24): Promise<ReadonlyArray<WatchProgressAnimeItem>> {
    const user = await this.identity.requireUser();
    const capped = Math.min(Math.max(1, limit), MAX_LIST);
    return this.progress.listForUser(user.id, capped);
  }

  async getMine(animeId: number): Promise<WatchProgressRecord | null> {
    const user = await this.identity.requireUser();
    this.assertAnimeId(animeId);
    return this.progress.get(user.id, animeId);
  }

  async upsertMine(animeId: number, body: WatchProgressWriteBody): Promise<WatchProgressRecord> {
    const user = await this.identity.requireUser();
    this.assertAnimeId(animeId);

    const positionSeconds = clampInt(body.positionSeconds, 0, MAX_POSITION);
    const durationSeconds = clampInt(body.durationSeconds ?? 0, 0, MAX_POSITION);
    const completed = deriveCompleted({
      positionSeconds,
      durationSeconds,
      completed: body.completed,
    });

    const record = await this.progress.upsert({
      userId: user.id,
      animeId,
      positionSeconds: completed && durationSeconds > 0 ? durationSeconds : positionSeconds,
      durationSeconds,
      completed,
      force: body.force === true,
    });

    if (this.events) {
      const eventType = resolveProductEvent(body.clientEvent, completed);
      if (eventType) {
        try {
          await this.events.insert({
            userId: user.id,
            eventType,
            animeId,
            properties: {
              positionSeconds: record.positionSeconds,
              durationSeconds: record.durationSeconds,
              completed: record.completed,
            },
          });
        } catch {
          // Analytics must not fail progress writes.
        }
      }
    }

    return record;
  }

  async deleteMine(animeId: number): Promise<void> {
    const user = await this.identity.requireUser();
    this.assertAnimeId(animeId);
    await this.progress.delete(user.id, animeId);
  }

  async deleteAllMine(): Promise<void> {
    const user = await this.identity.requireUser();
    await this.progress.deleteAll(user.id);
  }

  /**
   * Merge guest localStorage rows into the logged-in account.
   * Keeps the farther progress / newer lastWatched when conflict.
   */
  async mergeGuestRows(
    rows: ReadonlyArray<{
      animeId: number;
      positionSeconds: number;
      durationSeconds: number;
      completed?: boolean;
      lastWatchedAt?: string;
    }>,
  ): Promise<{ merged: number }> {
    const user = await this.identity.requireUser();
    let merged = 0;
    for (const row of rows.slice(0, MAX_LIST)) {
      if (!Number.isFinite(row.animeId) || row.animeId <= 0) continue;
      const existing = await this.progress.get(user.id, row.animeId);
      const incomingCompleted = deriveCompleted({
        positionSeconds: row.positionSeconds,
        durationSeconds: row.durationSeconds,
        completed: row.completed,
      });
      const incomingPos = clampInt(row.positionSeconds, 0, MAX_POSITION);
      const incomingDur = clampInt(row.durationSeconds, 0, MAX_POSITION);

      const lastWatchedAt = clampLastWatchedAt(row.lastWatchedAt);

      if (!existing) {
        await this.progress.upsert({
          userId: user.id,
          animeId: row.animeId,
          positionSeconds: incomingPos,
          durationSeconds: incomingDur,
          completed: incomingCompleted,
          force: true,
          lastWatchedAt,
        });
        merged += 1;
        continue;
      }

      const useIncoming =
        incomingCompleted && !existing.completed
        || (!existing.completed && incomingPos > existing.positionSeconds)
        || (incomingCompleted
          && existing.completed
          && lastWatchedAt.getTime() > new Date(existing.lastWatchedAt).getTime());

      if (useIncoming) {
        await this.progress.upsert({
          userId: user.id,
          animeId: row.animeId,
          positionSeconds: incomingPos,
          durationSeconds: Math.max(incomingDur, existing.durationSeconds),
          completed: incomingCompleted || existing.completed,
          force: true,
          lastWatchedAt,
        });
        merged += 1;
      }
    }
    return { merged };
  }

  private assertAnimeId(animeId: number): void {
    if (!Number.isFinite(animeId) || animeId <= 0) {
      throw new AppError('RESULT_INVALID', '无效的作品 ID', 400);
    }
  }
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Guest timestamps may not be far in the future (5 min skew). */
function clampLastWatchedAt(raw: string | undefined): Date {
  const now = Date.now();
  const maxFuture = now + 5 * 60_000;
  if (!raw) return new Date(now);
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return new Date(now);
  return new Date(Math.min(t, maxFuture));
}

function resolveProductEvent(
  clientEvent: WatchClientEvent | undefined,
  completed: boolean,
): string | null {
  if (!clientEvent || clientEvent === 'play_progress' || clientEvent === 'pause') return null;
  if (clientEvent === 'play_complete') return 'play_complete';
  if (clientEvent === 'play_start') return 'play_start';
  if (
    clientEvent === 'play_25_percent'
    || clientEvent === 'play_50_percent'
    || clientEvent === 'play_75_percent'
  ) {
    return completed ? 'play_complete' : clientEvent;
  }
  return null;
}

export type { UpsertWatchProgressInput };
