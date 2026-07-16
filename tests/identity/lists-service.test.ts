import assert from 'node:assert/strict';
import test from 'node:test';
import { ListsService } from '../../lib/server/identity/application/lists-service';
import type {
  ListsRepository,
  UserListItemAnime,
  UserListRecord,
} from '../../lib/server/identity/ports/lists-repository';
import type { UserRecord } from '../../lib/server/identity/ports/user-repository';
import { AppError } from '../../lib/server/shared/errors';

class MemoryLists implements ListsRepository {
  lists: UserListRecord[] = [];
  items = new Map<number, UserListItemAnime[]>();
  seq = 1;

  async ensureSystemLists(userId: number) {
    if (this.lists.some((l) => l.userId === userId && l.isSystem)) return;
    for (const [listType, name, sortOrder] of [
      ['favorites', '收藏', 0],
      ['want', '想看', 1],
      ['watching', '在看', 2],
      ['completed', '已看完', 3],
    ] as const) {
      this.lists.push({
        id: this.seq++,
        userId,
        name,
        listType,
        visibility: 'private',
        isSystem: true,
        sortOrder,
        itemCount: 0,
      });
    }
  }

  async listForUser(userId: number) {
    await this.ensureSystemLists(userId);
    return this.lists.filter((l) => l.userId === userId);
  }

  async getList(userId: number, listId: number) {
    return this.lists.find((l) => l.userId === userId && l.id === listId) ?? null;
  }

  async createCustomList(userId: number, name: string) {
    const list: UserListRecord = {
      id: this.seq++,
      userId,
      name,
      listType: 'custom',
      visibility: 'private',
      isSystem: false,
      sortOrder: 100,
      itemCount: 0,
    };
    this.lists.push(list);
    return list;
  }

  async deleteCustomList(userId: number, listId: number) {
    const list = await this.getList(userId, listId);
    if (!list || list.isSystem) return;
    this.lists = this.lists.filter((l) => l.id !== listId);
    this.items.delete(listId);
  }

  async listItems(userId: number, listId: number) {
    const list = await this.getList(userId, listId);
    if (!list) return [];
    return this.items.get(listId) ?? [];
  }

  async addItem(userId: number, listId: number, animeId: number, note: string | null = null) {
    const list = await this.getList(userId, listId);
    if (!list) return;
    const rows = this.items.get(listId) ?? [];
    if (!rows.some((r) => r.animeId === animeId)) {
      rows.push({
        listId,
        animeId,
        note,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        title: `A${animeId}`,
        cover: null,
        viewCount: 0,
      });
      this.items.set(listId, rows);
    }
  }

  async removeItem(userId: number, listId: number, animeId: number) {
    const rows = this.items.get(listId) ?? [];
    this.items.set(listId, rows.filter((r) => r.animeId !== animeId));
  }

  async setItemNote(userId: number, listId: number, animeId: number, note: string | null) {
    const rows = this.items.get(listId) ?? [];
    this.items.set(
      listId,
      rows.map((r) => (r.animeId === animeId ? { ...r, note } : r)),
    );
  }
}

function identity(userId = 3) {
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
  };
}

test('lists service creates custom list and manages items', async () => {
  const repo = new MemoryLists();
  const service = new ListsService(repo, identity() as never);
  const lists = await service.listMine();
  assert.ok(lists.some((l) => l.listType === 'want'));

  const custom = await service.createCustom('周末');
  await service.addItem(custom.id, 42, 'note');
  const items = await service.itemsMine(custom.id);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.note, 'note');

  await service.setNote(custom.id, 42, 'updated');
  assert.equal((await service.itemsMine(custom.id))[0]?.note, 'updated');

  await service.removeItem(custom.id, 42);
  assert.equal((await service.itemsMine(custom.id)).length, 0);

  await service.deleteCustom(custom.id);
  assert.equal((await service.listMine()).some((l) => l.id === custom.id), false);
});

test('lists service rejects empty custom name', async () => {
  const service = new ListsService(new MemoryLists(), identity() as never);
  await assert.rejects(() => service.createCustom('  '), (e: unknown) => e instanceof AppError);
});
