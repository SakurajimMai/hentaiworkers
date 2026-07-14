import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AdminCatalogService,
  type AdminAnimeSaveInput,
  type AdminCatalogRepository,
  type AdminTagSaveInput,
  type ImportAnimeItem,
  type ImportResult,
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

  async importBatch(items: readonly ImportAnimeItem[]): Promise<ImportResult> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ index: number; message: string }> = [];

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const title = String(item.title || '').trim();
      const videoUrl = String(item.videoUrl || item.video_url || '').trim();
      if (!title || !videoUrl) {
        skipped += 1;
        continue;
      }
      try {
        const existingId = item.id ? Number(item.id) : null;
        if (existingId && this.animes.has(existingId)) {
          await this.saveAnimeTransactional({
            id: existingId,
            title,
            videoUrl,
            isActive: 1,
          });
          updated += 1;
        } else {
          await this.saveAnimeTransactional({ title, videoUrl, isActive: 1 });
          created += 1;
        }
      } catch (error) {
        errors.push({
          index,
          message: error instanceof Error ? error.message : 'fail',
        });
      }
    }

    return { created, updated, skipped, errors };
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

test('importBatch returns created/updated/skipped counts', async () => {
  const repo = new FakeAdminRepo();
  const service = new AdminCatalogService(repo);
  await service.saveAnime({
    id: 50,
    title: '旧',
    videoUrl: 'https://old',
  });
  // Force id 50 into map
  repo.animes.set(50, {
    id: 50,
    title: '旧',
    videoUrl: 'https://old',
  });

  const result = await service.importBatch([
    { title: '', videoUrl: '' },
    { id: 50, title: '更新', videoUrl: 'https://new' },
    { title: '新建', videoUrl: 'https://create' },
  ]);

  assert.equal(result.skipped, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.created, 1);
  assert.equal(result.errors.length, 0);
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
