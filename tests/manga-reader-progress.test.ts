import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createReaderProgressWriteQueue,
  type ReaderProgressWrite,
} from '../components/manga-reader-progress';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('progress writes are serialized and queued pages collapse to the latest value', async () => {
  const first = deferred<boolean>();
  const calls: ReaderProgressWrite[] = [];
  let activeWrites = 0;
  let maximumActiveWrites = 0;

  const queue = createReaderProgressWriteQueue(async (write) => {
    calls.push(write);
    activeWrites += 1;
    maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
    const completed = write.pageIndex === 1 ? await first.promise : true;
    activeWrites -= 1;
    return completed;
  });

  queue.enqueue(1);
  queue.enqueue(2);
  queue.enqueue(3);

  assert.deepEqual(calls.map((write) => write.pageIndex), [1]);
  first.resolve(true);
  await queue.whenIdle();

  assert.deepEqual(calls.map((write) => write.pageIndex), [1, 3]);
  assert.equal(maximumActiveWrites, 1);
});

test('a final latest page is dispatched only after the older in-flight write settles', async () => {
  const attempts: Array<{
    write: ReaderProgressWrite;
    completion: ReturnType<typeof deferred<boolean>>;
  }> = [];
  let storedPage: number | null = null;

  const queue = createReaderProgressWriteQueue(async (write) => {
    const completion = deferred<boolean>();
    attempts.push({ write, completion });
    const completed = await completion.promise;
    if (completed) storedPage = write.pageIndex;
    return completed;
  });

  queue.enqueue(4);
  queue.enqueue(9);
  assert.equal(attempts.length, 1);

  attempts[0].completion.resolve(true);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await new Promise<void>((resolve) => queueMicrotask(resolve));

  assert.equal(storedPage, 4);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].write.pageIndex, 9);

  attempts[1].completion.resolve(true);
  await queue.whenIdle();
  assert.equal(storedPage, 9);
});
