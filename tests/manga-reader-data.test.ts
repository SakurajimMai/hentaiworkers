import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMangaReaderDataLoader,
  parseMangaIdentifier,
  selectMangaIdentifierMatch,
  type ChapterSummary,
  type MangaPage,
  type MangaSummary,
} from '../lib/manga-service';

const manga: MangaSummary = {
  id: 41,
  slug: 'reader-fixture',
  title: 'Reader fixture',
  author: null,
  tags: ['fixture'],
  description: null,
  coverUrl: 'https://image.example/cover.jpg',
  chapterCount: 2,
  pageCount: 3,
  sourceChatTitle: null,
  updatedAt: null,
};

const chapters: ChapterSummary[] = [
  { id: 412, number: 2, title: null, pageCount: 2, createdAt: null },
  { id: 411, number: 1, title: null, pageCount: 1, createdAt: null },
];

const pages: MangaPage[] = [
  { index: 1, imageUrl: 'https://image.example/2.jpg' },
  { index: 0, imageUrl: 'https://image.example/1.jpg' },
];

test('漫画标识保留精确 slug 优先并支持数字 ID fallback', () => {
  const identifier = parseMangaIdentifier('  41  ');
  const slugMatch = { id: 99, slugMatches: 1 };
  const idMatch = { id: 41, slugMatches: 0 };

  assert.deepEqual(identifier, { slug: '41', numericId: 41 });
  assert.equal(selectMangaIdentifierMatch(identifier, [idMatch, slugMatch]), slugMatch);
  assert.equal(selectMangaIdentifierMatch(identifier, [idMatch]), idMatch);
  assert.equal(
    selectMangaIdentifierMatch(parseMangaIdentifier('reader-fixture'), [idMatch]),
    null,
  );
});

test('漫画 slug 命中采用数据库 collation 标记，不在 JavaScript 中重复区分大小写', () => {
  const databaseMatch = { id: 41, slugMatches: true };
  assert.equal(
    selectMangaIdentifierMatch(parseMangaIdentifier('READER-FIXTURE'), [databaseMatch]),
    databaseMatch,
  );
});

test('reader-data 每层只读取一次，并稳定章节与页面顺序', async () => {
  const calls = { manga: 0, chapters: 0, pages: 0 };
  const load = createMangaReaderDataLoader({
    resolvePublishedManga: async (identifier) => {
      calls.manga += 1;
      assert.equal(identifier, '41');
      return manga;
    },
    listPublishedChapters: async (mangaId) => {
      calls.chapters += 1;
      assert.equal(mangaId, manga.id);
      return chapters;
    },
    listChapterPages: async (chapterId) => {
      calls.pages += 1;
      assert.equal(chapterId, 412);
      return pages;
    },
  });

  const result = await load('41', 2);

  assert.deepEqual(calls, { manga: 1, chapters: 1, pages: 1 });
  assert.deepEqual(result?.manga.chapters.map((chapter) => chapter.number), [1, 2]);
  assert.deepEqual(result?.chapter.pages.map((page) => page.index), [0, 1]);
  assert.deepEqual(chapters.map((chapter) => chapter.number), [2, 1]);
  assert.deepEqual(pages.map((page) => page.index), [1, 0]);
});

test('未发布或不存在的漫画/章节不会读取页面', async () => {
  let chapterReads = 0;
  let pageReads = 0;
  const missingManga = createMangaReaderDataLoader({
    resolvePublishedManga: async () => null,
    listPublishedChapters: async () => {
      chapterReads += 1;
      return chapters;
    },
    listChapterPages: async () => {
      pageReads += 1;
      return pages;
    },
  });

  assert.equal(await missingManga('hidden', 1), null);
  assert.equal(chapterReads, 0);
  assert.equal(pageReads, 0);

  const missingChapter = createMangaReaderDataLoader({
    resolvePublishedManga: async () => manga,
    listPublishedChapters: async () => {
      chapterReads += 1;
      return chapters;
    },
    listChapterPages: async () => {
      pageReads += 1;
      return pages;
    },
  });

  assert.equal(await missingChapter('41', 404), null);
  assert.equal(chapterReads, 1);
  assert.equal(pageReads, 0);
});

test('reader-data 依赖异常原样传播', async () => {
  const failure = new Error('synthetic reader query failure');
  const load = createMangaReaderDataLoader({
    resolvePublishedManga: async () => {
      throw failure;
    },
    listPublishedChapters: async () => chapters,
    listChapterPages: async () => pages,
  });

  await assert.rejects(load('41', 1), (error) => error === failure);
});
