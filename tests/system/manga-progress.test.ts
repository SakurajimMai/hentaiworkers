import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../../lib/server/shared/errors';
import { normalizeMangaProgressInput } from '../../lib/server/manga-progress';

test('manga progress input requires a chapter number of at least 1', () => {
  assert.throws(
    () => normalizeMangaProgressInput({ chapterNumber: 0 }),
    (error: unknown) => error instanceof AppError && error.code === 'RESULT_INVALID',
  );
  assert.throws(
    () => normalizeMangaProgressInput({ chapterNumber: 'nope' }),
    AppError,
  );
  assert.deepEqual(normalizeMangaProgressInput({ chapterNumber: 3, pageIndex: -2 }), {
    chapterNumber: 3,
    pageIndex: 0,
  });
  assert.deepEqual(normalizeMangaProgressInput({ chapterNumber: '12', pageIndex: '4' }), {
    chapterNumber: 12,
    pageIndex: 4,
  });
});
