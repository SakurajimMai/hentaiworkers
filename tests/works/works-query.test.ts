import assert from 'node:assert/strict';
import test from 'node:test';
import { WorksQueryService } from '../../lib/server/works/application/works-query-service';
import type {
  AnimeWorkDetail,
  AnimeWorkListQuery,
  AnimeWorkPage,
  AnimeWorkUpdateInput,
} from '../../lib/server/works/domain/models';
import type { WorksRepository } from '../../lib/server/works/ports/works-repository';

class FakeWorksRepo implements WorksRepository {
  active = true;
  lastUpdate: AnimeWorkUpdateInput | null = null;
  deletedIds: number[] = [];
  async list(query: AnimeWorkListQuery): Promise<AnimeWorkPage> {
    return {
      data: [
        {
          id: 1,
          title: 'Test work',
          titleEnglish: null,
          titleJapanese: null,
          coverUrl: null,
          streamUrl: 'https://cdn.example/a.m3u8',
          streamFormat: 'hls',
          releaseYear: 2026,
          remarks: null,
          actors: null,
          directors: null,
          aliases: null,
          area: null,
          lang: null,
          sourceUpdatedAt: null,
          isActive: true,
          viewCount: 0,
          updatedAt: new Date().toISOString(),
          sources: [{ source: 'ikun', sourceId: '1' }],
          playLineCount: 1,
          episodeCount: 1,
        },
      ],
      total: 1,
      page: query.page ?? 1,
      limit: query.limit ?? 24,
      totalPages: 1,
    };
  }
  async setActiveMany(ids: readonly number[], isActive: boolean): Promise<number> {
    this.active = isActive;
    return ids.length;
  }
  async delete(id: number): Promise<boolean> {
    if (id !== 1) return false;
    this.deletedIds.push(id);
    return true;
  }
  async deleteMany(ids: readonly number[]): Promise<number> {
    this.deletedIds.push(...ids);
    return ids.length;
  }
  async getById(id: number): Promise<AnimeWorkDetail | null> {
    if (id !== 1) return null;
    return {
      id: 1,
      title: 'Test work',
      titleEnglish: null,
      titleJapanese: null,
      coverUrl: null,
      streamUrl: 'https://cdn.example/a.m3u8',
      streamFormat: 'hls',
      releaseYear: 2026,
      remarks: null,
      actors: null,
      directors: null,
      aliases: null,
      area: null,
      lang: null,
      sourceUpdatedAt: null,
      isActive: this.active,
      viewCount: 0,
      updatedAt: new Date().toISOString(),
      sources: [{ source: 'ikun', sourceId: '1' }],
      playLineCount: 1,
      episodeCount: 1,
      description: 'd',
      fanartUrls: [],
      releaseDate: null,
      createdAt: new Date().toISOString(),
      tags: [],
      playLines: [
        {
          name: 'ikm3u8',
          flag: 'ikm3u8',
          episodes: [{ name: '第01集', url: 'https://cdn.example/a.m3u8' }],
        },
      ],
    };
  }
  async setActive(id: number, isActive: boolean): Promise<void> {
    assert.equal(id, 1);
    this.active = isActive;
  }
  async update(id: number, input: AnimeWorkUpdateInput): Promise<void> {
    assert.equal(id, 1);
    this.lastUpdate = input;
    this.active = input.isActive;
  }
}

test('WorksQueryService lists and toggles active flag', async () => {
  const repo = new FakeWorksRepo();
  const service = new WorksQueryService(repo);
  const page = await service.list({ page: 1 });
  assert.equal(page.total, 1);
  assert.equal(page.data[0].sources[0].source, 'ikun');
  await service.setActive(1, false);
  const detail = await service.getById(1);
  assert.equal(detail?.isActive, false);
});

test('WorksQueryService.update validates and normalizes play lines', async () => {
  const repo = new FakeWorksRepo();
  const service = new WorksQueryService(repo);
  await service.update(1, {
    title: '  Renamed  ',
    titleEnglish: null,
    titleJapanese: '  JP  ',
    description: '  desc  ',
    coverUrl: ' https://cdn.example/c.jpg ',
    fanartUrls: ['https://cdn.example/a.jpg', '', 'https://cdn.example/a.jpg'],
    streamUrl: ' https://cdn.example/a.m3u8 ',
    streamFormat: '',
    releaseYear: 2026,
    releaseDate: null,
    remarks: '更新至02集',
    actors: 'A,B',
    directors: 'D',
    aliases: '别名',
    area: '日本',
    lang: '日语',
    sourceUpdatedAt: '2026-07-14 23:18:30',
    isActive: true,
    tagIds: [3, 3, 0, -1],
    playLines: [
      {
        name: '主线',
        flag: 'main',
        episodes: [
          { name: '第01集', url: 'https://cdn.example/1.m3u8' },
          { name: '', url: 'https://cdn.example/skip.m3u8' },
        ],
      },
      { name: '空', flag: 'empty', episodes: [] },
    ],
  });
  assert.ok(repo.lastUpdate);
  assert.equal(repo.lastUpdate!.title, 'Renamed');
  assert.equal(repo.lastUpdate!.titleJapanese, 'JP');
  assert.equal(repo.lastUpdate!.streamFormat, 'hls');
  assert.deepEqual(repo.lastUpdate!.fanartUrls, ['https://cdn.example/a.jpg']);
  assert.deepEqual(repo.lastUpdate!.tagIds, [3]);
  assert.equal(repo.lastUpdate!.playLines.length, 1);
  assert.equal(repo.lastUpdate!.playLines[0].episodes.length, 1);
});

test('WorksQueryService.update rejects missing title', async () => {
  const repo = new FakeWorksRepo();
  const service = new WorksQueryService(repo);
  await assert.rejects(
    () =>
      service.update(1, {
        title: '   ',
        titleEnglish: null,
        titleJapanese: null,
        description: null,
        coverUrl: null,
        fanartUrls: [],
        streamUrl: 'https://cdn.example/a.m3u8',
        streamFormat: 'hls',
        releaseYear: null,
        releaseDate: null,
        remarks: null,
        actors: null,
        directors: null,
        aliases: null,
        area: null,
        lang: null,
        sourceUpdatedAt: null,
        isActive: true,
        tagIds: [],
        playLines: [],
      }),
    /Title and stream URL/,
  );
});
