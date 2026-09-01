import assert from 'node:assert/strict';
import test from 'node:test';
import { createMangaChapterHandler } from '../../app/api/mangas/[id]/chapters/[number]/handler';
import type { MangaReaderData } from '../../lib/manga-service';

const readerData: MangaReaderData = {
  manga: {
    id: 41,
    slug: 'reader-fixture',
    title: 'Reader fixture',
    author: null,
    tags: [],
    description: null,
    coverUrl: 'https://image.example/cover.jpg',
    chapterCount: 1,
    pageCount: 2,
    sourceChatTitle: null,
    updatedAt: null,
    chapters: [
      { id: 411, number: 1, title: null, pageCount: 2, createdAt: null },
    ],
  },
  chapter: {
    id: 411,
    number: 1,
    title: null,
    pageCount: 2,
    createdAt: null,
    pages: [
      { index: 0, imageUrl: 'https://image.example/1.jpg' },
      { index: 1, imageUrl: 'https://image.example/2.jpg' },
    ],
  },
};

function requestParams(id = '41', number = '1') {
  return { params: Promise.resolve({ id, number }) };
}

test('章节 API 保持公开 JSON shape，并只调一次 reader-data', async () => {
  let loads = 0;
  let recordedId: number | undefined;
  let scheduled: Promise<unknown> | undefined;
  let finishView: (() => void) | undefined;
  const viewTask = new Promise<void>((resolve) => {
    finishView = resolve;
  });
  const handler = createMangaChapterHandler({
    isMangaEnabled: async () => true,
    loadReaderData: async (identifier, chapterNumber) => {
      loads += 1;
      assert.equal(identifier, '41');
      assert.equal(chapterNumber, 1);
      return readerData;
    },
    recordView: (mangaId) => {
      recordedId = mangaId;
      return viewTask;
    },
    scheduleAfter: (task) => {
      scheduled = task;
    },
  });

  const response = await handler(new Request('http://fixture.invalid'), requestParams());

  assert.equal(response.status, 200);
  assert.equal(loads, 1);
  assert.equal(recordedId, 41);
  assert.equal(scheduled, viewTask);
  assert.deepEqual(await response.json(), {
    manga: {
      id: 41,
      title: 'Reader fixture',
      coverUrl: 'https://image.example/cover.jpg',
    },
    chapter: readerData.chapter,
  });
  finishView?.();
});

test('章节 API 在栏目关闭、参数非法或内容不存在时保持 404', async () => {
  let loads = 0;
  let schedules = 0;
  const dependencies = {
    loadReaderData: async () => {
      loads += 1;
      return null;
    },
    recordView: async () => undefined,
    scheduleAfter: () => {
      schedules += 1;
    },
  };
  const disabled = createMangaChapterHandler({
    ...dependencies,
    isMangaEnabled: async () => false,
  });
  const enabled = createMangaChapterHandler({
    ...dependencies,
    isMangaEnabled: async () => true,
  });

  const disabledResponse = await disabled(
    new Request('http://fixture.invalid'),
    requestParams(),
  );
  const invalidResponse = await enabled(
    new Request('http://fixture.invalid'),
    requestParams('41', 'invalid'),
  );
  const missingResponse = await enabled(
    new Request('http://fixture.invalid'),
    requestParams('41', '404'),
  );

  assert.equal(disabledResponse.status, 404);
  assert.deepEqual(await disabledResponse.json(), { error: 'Manga disabled' });
  assert.equal(invalidResponse.status, 404);
  assert.deepEqual(await invalidResponse.json(), { error: 'Not found' });
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), { error: 'Not found' });
  assert.equal(loads, 1);
  assert.equal(schedules, 0);
});

test('章节 API 查询异常保持 500 且不记录浏览', async () => {
  let schedules = 0;
  const handler = createMangaChapterHandler({
    isMangaEnabled: async () => true,
    loadReaderData: async () => {
      throw new Error('synthetic chapter failure');
    },
    recordView: async () => undefined,
    scheduleAfter: () => {
      schedules += 1;
    },
  });

  const response = await handler(new Request('http://fixture.invalid'), requestParams());

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'synthetic chapter failure' });
  assert.equal(schedules, 0);
});

test('章节 API 浏览统计失败不会改变成功响应', async () => {
  const handler = createMangaChapterHandler({
    isMangaEnabled: async () => true,
    loadReaderData: async () => readerData,
    recordView: async () => {
      throw new Error('synthetic view failure');
    },
    scheduleAfter: (task) => {
      void task.catch(() => undefined);
    },
  });

  const response = await handler(new Request('http://fixture.invalid'), requestParams());

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { chapter: { pages: unknown[] } }).chapter.pages,
    readerData.chapter.pages);
});

test('章节 API 无法注册 after task 时仍返回章节', async () => {
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    const handler = createMangaChapterHandler({
      isMangaEnabled: async () => true,
      loadReaderData: async () => readerData,
      recordView: async () => undefined,
      scheduleAfter: () => {
        throw new Error('synthetic scheduler failure');
      },
    });

    const response = await handler(new Request('http://fixture.invalid'), requestParams());

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { chapter: { id: number } }).chapter.id, 411);
  } finally {
    console.error = originalConsoleError;
  }
});
