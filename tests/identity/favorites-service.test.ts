import assert from 'node:assert/strict';
import test from 'node:test';
import { FavoritesService } from '../../lib/server/identity/application/favorites-service';
import { IdentityService } from '../../lib/server/identity/application/identity-service';
import type {
  FavoriteAnimeListItem,
  FavoritesRepository,
} from '../../lib/server/identity/ports/favorites-repository';
import type { PasswordHasher } from '../../lib/server/identity/ports/password-hasher';
import type { SessionPort } from '../../lib/server/identity/ports/session';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserRecord,
  UserRepository,
} from '../../lib/server/identity/ports/user-repository';
import type { SessionData } from '../../lib/server/identity/session-config';
import { AppError } from '../../lib/server/shared/errors';

class MemoryUsers implements UserRepository {
  private seq = 1;
  private readonly rows = new Map<number, UserRecord>();

  async findById(id: number) {
    return this.rows.get(id) ?? null;
  }

  async findByUsername(username: string) {
    return [...this.rows.values()].find((row) => row.username === username) ?? null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const id = this.seq++;
    const row: UserRecord = {
      id,
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      displayName: input.displayName ?? null,
      isActive: input.isActive ?? 1,
    };
    this.rows.set(id, row);
    return row;
  }

  async update(id: number, input: UpdateUserInput): Promise<void> {
    const current = this.rows.get(id);
    if (!current) return;
    this.rows.set(id, {
      ...current,
      role: input.role ?? current.role,
      displayName: input.displayName === undefined ? current.displayName : input.displayName,
      isActive: input.isActive ?? current.isActive,
      passwordHash: input.passwordHash ?? current.passwordHash,
    });
  }

  async list() {
    return [...this.rows.values()];
  }
}

class MemorySession implements SessionPort {
  data: SessionData = { isLoggedIn: false };

  async get() {
    return { ...this.data };
  }

  async save(data: SessionData) {
    this.data = { ...data };
  }

  async destroy() {
    this.data = { isLoggedIn: false };
  }
}

class MemoryPasswords implements PasswordHasher {
  async hash(plain: string) {
    return `hash:${plain}`;
  }

  async verify(plain: string, hash: string) {
    return hash === `hash:${plain}`;
  }
}

class MemoryFavorites implements FavoritesRepository {
  private readonly keys = new Set<string>();

  private key(userId: number, animeId: number) {
    return `${userId}:${animeId}`;
  }

  async listAnimeIds(userId: number) {
    return [...this.keys]
      .filter((k) => k.startsWith(`${userId}:`))
      .map((k) => Number(k.split(':')[1]));
  }

  async listWithAnime(userId: number): Promise<ReadonlyArray<FavoriteAnimeListItem>> {
    const ids = await this.listAnimeIds(userId);
    return ids.map((id) => ({
      id,
      title: `Anime ${id}`,
      cover: null,
      viewCount: 0,
      titleEnglish: null,
      favoritedAt: new Date().toISOString(),
    }));
  }

  async isFavorite(userId: number, animeId: number) {
    return this.keys.has(this.key(userId, animeId));
  }

  async add(userId: number, animeId: number) {
    this.keys.add(this.key(userId, animeId));
  }

  async remove(userId: number, animeId: number) {
    this.keys.delete(this.key(userId, animeId));
  }
}

function build() {
  const users = new MemoryUsers();
  const sessions = new MemorySession();
  const identity = new IdentityService(users, sessions, new MemoryPasswords());
  const favoritesRepo = new MemoryFavorites();
  const favorites = new FavoritesService(favoritesRepo, identity);
  return { identity, favorites, favoritesRepo };
}

test('toggle favorite requires login then adds and removes', async () => {
  const { identity, favorites } = build();
  await assert.rejects(() => favorites.toggle(10), AppError);

  await identity.registerWithEmail({
    email: 'fan@example.com',
    password: 'password1',
  });

  assert.equal(await favorites.isFavorite(10), false);
  assert.deepEqual(await favorites.toggle(10), { favorited: true });
  assert.equal(await favorites.isFavorite(10), true);
  assert.deepEqual(await favorites.toggle(10), { favorited: false });
  assert.equal(await favorites.isFavorite(10), false);
});

test('listMine returns favorited anime summaries', async () => {
  const { identity, favorites } = build();
  await identity.registerWithEmail({
    email: 'list@example.com',
    password: 'password1',
  });
  await favorites.add(3);
  await favorites.add(7);
  const list = await favorites.listMine();
  assert.equal(list.length, 2);
  assert.ok(list.some((item) => item.id === 3));
  assert.ok(list.some((item) => item.id === 7));
});
