import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveCompleted,
  WatchProgressService,
} from '../../lib/server/identity/application/watch-progress-service';
import type {
  UpsertWatchProgressInput,
  WatchProgressAnimeItem,
  WatchProgressRecord,
  WatchProgressRepository,
} from '../../lib/server/identity/ports/watch-progress-repository';
import type { UserEventsRepository } from '../../lib/server/identity/ports/user-events-repository';
import type { UserRecord } from '../../lib/server/identity/ports/user-repository';
import { AppError } from '../../lib/server/shared/errors';

class MemoryProgress implements WatchProgressRepository {
  readonly rows = new Map<string, WatchProgressRecord>();

  private key(userId: number, animeId: number) {
    return `${userId}:${animeId}`;
  }

  async listForUser(userId: number): Promise<ReadonlyArray<WatchProgressAnimeItem>> {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId)
      .map((r) => ({
        ...r,
        title: `Title ${r.animeId}`,
        cover: null,
        videoUrl: 'https://cdn.example/v.mp4',
        isActive: true,
      }));
  }

  async get(userId: number, animeId: number) {
    return this.rows.get(this.key(userId, animeId)) ?? null;
  }

  async upsert(input: UpsertWatchProgressInput): Promise<WatchProgressRecord> {
    const existing = await this.get(input.userId, input.animeId);
    const duration = Math.max(existing?.durationSeconds ?? 0, input.durationSeconds);
    let position = input.positionSeconds;
    let completed = input.completed || existing?.completed === true;
    const rewatchRestart =
      !input.force
      && existing?.completed
      && !input.completed
      && input.positionSeconds < Math.max(30, Math.floor(duration * 0.1));
    if (rewatchRestart) {
      completed = false;
      position = input.positionSeconds;
    } else if (existing && !input.force && !input.completed && position < existing.positionSeconds && !existing.completed) {
      position = existing.positionSeconds;
    }
    if (completed && duration > 0) position = Math.max(position, duration);
    const now = (input.lastWatchedAt ?? new Date()).toISOString();
    const row: WatchProgressRecord = {
      userId: input.userId,
      animeId: input.animeId,
      episodeId: null,
      positionSeconds: position,
      durationSeconds: duration,
      completed,
      firstWatchedAt: existing?.firstWatchedAt ?? now,
      lastWatchedAt: now,
      updatedAt: now,
    };
    this.rows.set(this.key(input.userId, input.animeId), row);
    return row;
  }

  async delete(userId: number, animeId: number) {
    this.rows.delete(this.key(userId, animeId));
  }

  async deleteAll(userId: number) {
    for (const key of [...this.rows.keys()]) {
      if (key.startsWith(`${userId}:`)) this.rows.delete(key);
    }
  }
}

function fakeIdentity(userId = 7) {
  const user: UserRecord = {
    id: userId,
    username: 'u@example.com',
    passwordHash: 'x',
    sessionVersion: 1,
    role: 'user',
    displayName: 'U',
    isActive: 1,
  };
  return {
    async requireUser() {
      return user;
    },
    async getCurrentUser() {
      return user;
    },
  };
}

test('deriveCompleted marks 90% and near-end as complete', () => {
  assert.equal(deriveCompleted({ positionSeconds: 90, durationSeconds: 100 }), true);
  assert.equal(deriveCompleted({ positionSeconds: 96, durationSeconds: 100 }), true);
  assert.equal(deriveCompleted({ positionSeconds: 50, durationSeconds: 100 }), false);
  assert.equal(deriveCompleted({ positionSeconds: 10, durationSeconds: 0 }), false);
});

test('upsert does not regress position without force', async () => {
  const repo = new MemoryProgress();
  const events: UserEventsRepository = {
    async insert() {},
  };
  const service = new WatchProgressService(repo, fakeIdentity() as never, events);

  await service.upsertMine(1, { positionSeconds: 40, durationSeconds: 100, clientEvent: 'play_start' });
  const mid = await service.upsertMine(1, { positionSeconds: 20, durationSeconds: 100 });
  assert.equal(mid.positionSeconds, 40);

  const forced = await service.upsertMine(1, {
    positionSeconds: 10,
    durationSeconds: 100,
    force: true,
  });
  assert.equal(forced.positionSeconds, 10);
});

test('90 percent write marks completed', async () => {
  const repo = new MemoryProgress();
  const service = new WatchProgressService(repo, fakeIdentity() as never);
  const row = await service.upsertMine(2, {
    positionSeconds: 910,
    durationSeconds: 1000,
    clientEvent: 'play_complete',
  });
  assert.equal(row.completed, true);
  assert.equal(row.positionSeconds, 1000);
});

test('mergeGuestRows keeps farther progress', async () => {
  const repo = new MemoryProgress();
  const service = new WatchProgressService(repo, fakeIdentity() as never);
  await service.upsertMine(3, { positionSeconds: 30, durationSeconds: 200 });
  const result = await service.mergeGuestRows([
    { animeId: 3, positionSeconds: 80, durationSeconds: 200 },
    { animeId: 4, positionSeconds: 15, durationSeconds: 100 },
  ]);
  assert.equal(result.merged, 2);
  assert.equal((await service.getMine(3))?.positionSeconds, 80);
  assert.equal((await service.getMine(4))?.positionSeconds, 15);
});

test('unauthenticated list throws', async () => {
  const repo = new MemoryProgress();
  const identity = {
    async requireUser() {
      throw new AppError('AUTH_REQUIRED', '请先登录', 401);
    },
  };
  const service = new WatchProgressService(repo, identity as never);
  await assert.rejects(() => service.listMine(), (e: unknown) => e instanceof AppError && e.status === 401);
});

test('rewatch from early position clears sticky completed state', async () => {
  const repo = new MemoryProgress();
  const service = new WatchProgressService(repo, fakeIdentity() as never);
  await service.upsertMine(5, {
    positionSeconds: 950,
    durationSeconds: 1000,
    clientEvent: 'play_complete',
  });
  assert.equal((await service.getMine(5))?.completed, true);

  const restarted = await service.upsertMine(5, {
    positionSeconds: 12,
    durationSeconds: 1000,
    clientEvent: 'play_start',
  });
  assert.equal(restarted.completed, false);
  assert.equal(restarted.positionSeconds, 12);
});
