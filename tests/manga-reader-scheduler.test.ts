import assert from 'node:assert/strict';
import test from 'node:test';
import { ReaderImageScheduler } from '../components/manga-reader-scheduler';

function schedulerFor(pageCount: number, initialPage: number) {
  return new ReaderImageScheduler(Array.from({ length: pageCount }, (_, index) => index), initialPage);
}

test('initial speculative grace always admits visible pages and can expire independently', () => {
  const scheduler = new ReaderImageScheduler([0, 1, 2, 3, 4], 0, false);
  assert.deepEqual([...scheduler.admittedPages], [0]);
  scheduler.updateViewport(0, [0, 1]);
  assert.deepEqual([...scheduler.admittedPages], [0, 1]);
  scheduler.settle(1, 'success');
  assert.ok(!scheduler.admittedPages.has(2));
  scheduler.enablePrefetch();
  assert.ok(scheduler.admittedPages.has(2));
});

test('initial transfer success or failure ends the grace without waiting for decode', () => {
  for (const outcome of ['success', 'error'] as const) {
    const scheduler = new ReaderImageScheduler([0, 1, 2, 3], 0, false);
    scheduler.settle(0, outcome);
    assert.deepEqual([...scheduler.admittedPages], [0, 1, 2]);
  }
});

test('delayed current image permits two speculative requests but never drains the chapter', () => {
  const scheduler = schedulerFor(292, 0);
  assert.deepEqual([...scheduler.admittedPages], [0, 1, 2]);
  scheduler.settle(1, 'success');
  scheduler.settle(2, 'success');
  assert.deepEqual([...scheduler.admittedPages], [0, 1, 2]);
  scheduler.updateViewport(1, [1]);
  assert.deepEqual([...scheduler.admittedPages], [0, 1, 2, 3]);
  scheduler.settle(3, 'success');
  assert.deepEqual([...scheduler.admittedPages], [0, 1, 2, 3, 4]);
  scheduler.settle(4, 'success');
  scheduler.settle(5, 'success');
  assert.deepEqual([...scheduler.admittedPages], [0, 1, 2, 3, 4, 5]);
});

test('all visible pages bypass occupied speculative slots on a distant jump', () => {
  const scheduler = schedulerFor(292, 0);
  scheduler.updateViewport(200, [200, 201]);
  assert.deepEqual([...scheduler.admittedPages], [0, 1, 2, 200, 201]);
  scheduler.settle(0, 'success');
  scheduler.settle(1, 'success');
  assert.ok(scheduler.admittedPages.has(202));
  assert.ok(!scheduler.admittedPages.has(3));
});

test('restoration starts at target and reversal moves the bounded window backwards', () => {
  const scheduler = schedulerFor(292, 200);
  assert.deepEqual([...scheduler.admittedPages], [200, 201, 199]);
  scheduler.settle(201, 'success');
  assert.ok(scheduler.admittedPages.has(202));
  scheduler.settle(200, 'success');
  scheduler.settle(199, 'success');
  scheduler.settle(202, 'success');
  scheduler.updateViewport(199, [199]);
  assert.ok(scheduler.admittedPages.has(198));
  assert.ok(scheduler.admittedPages.has(197));
  assert.ok(!scheduler.admittedPages.has(0));
  assert.ok(!scheduler.admittedPages.has(203));
});

test('failure releases capacity without an automatic retry loop, explicit retry is accounted for', () => {
  const scheduler = schedulerFor(50, 10);
  scheduler.settle(11, 'error');
  assert.ok(scheduler.admittedPages.has(12));
  scheduler.retry(11);
  scheduler.updateViewport(12, [12]);
  assert.ok(!scheduler.admittedPages.has(13));
  scheduler.settle(11, 'error');
  scheduler.settle(9, 'error');
  assert.ok(scheduler.admittedPages.has(13));
  scheduler.settle(11, 'error');
  assert.ok(!scheduler.admittedPages.has(14));
});

test('duplicate completion and old chapter callbacks cannot consume the new chapter queue', () => {
  const oldChapter = schedulerFor(100, 0);
  const nextChapter = schedulerFor(100, 40);
  oldChapter.settle(1, 'error');
  assert.equal(oldChapter.settle(1, 'success'), false);
  assert.deepEqual([...nextChapter.admittedPages], [40, 41, 39]);
  assert.deepEqual([...schedulerFor(0, 9).admittedPages], []);
});

test('deleted page gaps do not occupy slots or reject the actual last page', () => {
  const scheduler = new ReaderImageScheduler([0, 3, 4, 5, 6, 7], 0);
  assert.deepEqual([...scheduler.admittedPages], [0, 3, 4]);
  scheduler.updateViewport(7, [7]);
  assert.ok(scheduler.admittedPages.has(7));
  scheduler.settle(0, 'success');
  scheduler.settle(3, 'success');
  scheduler.settle(4, 'success');
  scheduler.updateViewport(6, [6]);
  assert.ok(scheduler.admittedPages.has(5));
  assert.ok(!scheduler.admittedPages.has(1));
  assert.ok(!scheduler.admittedPages.has(2));
  assert.deepEqual([...new ReaderImageScheduler([0, 3, 7], 7).admittedPages], [7, 3]);
});
