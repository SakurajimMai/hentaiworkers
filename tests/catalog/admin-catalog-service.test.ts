import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AdminCatalogService,
  type AdminAnimeSaveInput,
  type AdminCatalogRepository,
  type AdminTagSaveInput,
} from '../../lib/server/catalog/application/admin-catalog-service';
import { AppError } from '../../lib/server/shared/errors';

class FakeAdminRepo implements AdminCatalogRepository {
  animes = new Map<number, AdminAnimeSaveInput & { id: number }>();
  tags = new Map<number, { id: number; name: string; description: string | null }>();
  links = new Map<number, number[]>();
  nextAnimeId = 1;
  nextTagId = 1;
  failMidSave = false;
  transactions: string[] = [];

  async saveAnimeTransactional(input: AdminAnimeSaveInput): Promise<number> {
    this.transactions.push('save');
    if (this.failMidSave) {
      throw new Error('forced-failure');
    }
    const id = input.id && Number.isFinite(input.id) ? Number(input.id) : this.nextAnimeId++;
    this.animes.set(id, { ...input, id });
    this.links.set(id, [...(input.tagIds ?? [])]);
    return id;
  }

  async deleteAnimeTransactional(id: number): Promise<void> {
    this.transactions.push('delete');
    this.animes.delete(id);
    this.links.delete(id);
  }

  async setAnimeActive(id: number, isActive: number): Promise<void> {
    const current = this.animes.get(id);
    if (!current) return;
    this.animes.set(id, { ...current, isActive });
  }

  async saveTag(input: AdminTagSaveInput): Promise<number> {
    const id = input.id ?? this.nextTagId++;
    this.tags.set(id, {
      id,
      name: input.name,
      description: input.description ?? null,
    });
    return id;
  }

  async deleteTagIfUnlinked(id: number): Promise<void> {
    this.tags.delete(id);
  }

  async countTagLinks(tagId: number): Promise<number> {
    let count = 0;
    for (const tagIds of this.links.values()) {
      if (tagIds.includes(tagId)) count += 1;
    }
    return count;
  }

  async searchAnimes() {
    return { data: [], total: 0 };
  }
}

test('saveAnime rejects empty title/video and returns repository insert id', async () => {
  const repo = new FakeAdminRepo();
  const service = new AdminCatalogService(repo);

  await assert.rejects(
    () => service.saveAnime({ title: '', videoUrl: 'https://x' }),
    AppError,
  );

  const id = await service.saveAnime({
    title: '作品',
    videoUrl: 'https://example.com/v.mp4',
    tagIds: [1, 2],
  });
  assert.equal(id, 1);
  assert.deepEqual(repo.links.get(1), [1, 2]);
  assert.equal(repo.transactions.includes('save'), true);
});

test('deleteTag blocks when linked and deleteAnime uses transactional path', async () => {
  const repo = new FakeAdminRepo();
  const service = new AdminCatalogService(repo);
  const animeId = await service.saveAnime({
    title: 'A',
    videoUrl: 'https://v',
    tagIds: [9],
  });
  repo.tags.set(9, { id: 9, name: 'tag', description: null });

  await assert.rejects(() => service.deleteTag(9), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'RESULT_CONFLICT');
    assert.equal(error.details?.count, 1);
    return true;
  });

  await service.deleteAnime(animeId);
  assert.equal(repo.animes.has(animeId), false);
  assert.equal(repo.transactions.includes('delete'), true);
});

test('admin actions no longer import drizzle schema directly', () => {
  const source = readFileSync('app/admin/actions.ts', 'utf8');
  assert.doesNotMatch(source, /from ['\"]drizzle-orm['\"]/);
  assert.doesNotMatch(source, /from ['\"]@\/lib\/schema['\"]/);
  assert.doesNotMatch(source, /from ['\"]@\/lib\/db['\"]/);
  assert.match(source, /getIdentityService/);
  assert.match(source, /getAdminCatalogService/);
});

test('mariadb admin repository uses transactions and insertId path', () => {
  const source = readFileSync(
    'lib/server/infrastructure/database/mariadb-admin-catalog-repository.ts',
    'utf8',
  );
  assert.match(source, /\.transaction\(/);
  assert.match(source, /insertId/);
  assert.doesNotMatch(source, /where\(eq\(animes\.title, title\)\)/);
});

test('deleteAnimeTransactional hard-deletes anime and dependent rows', () => {
  const source = readFileSync(
    'lib/server/infrastructure/database/mariadb-admin-catalog-repository.ts',
    'utf8',
  );
  assert.match(source, /deleteAnimeAndDependents/);
  assert.match(source, /mediaSources/);
  assert.match(source, /userWatchProgress/);
  assert.match(source, /userFavorites/);
  assert.match(source, /userEvents/);
  assert.match(source, /DELETE FROM user_list_items WHERE anime_id/);
  assert.match(source, /delete\(animes\)/);
  // Soft-delete (is_active) must not be the delete path.
  const deleteFn = source.slice(
    source.indexOf('deleteAnimeTransactional'),
    source.indexOf('setAnimeActive'),
  );
  assert.doesNotMatch(deleteFn, /isActive|is_active/);
});
