import assert from 'node:assert/strict';
import test from 'node:test';

import {
  publicReadCacheKey,
  StaleReadCache,
} from '../../lib/server/shared/stale-read-cache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createCache<T>(
  now: () => number,
  options?: {
    maxEntries?: number;
    onBackgroundError?: (error: unknown) => void;
  },
) {
  return new StaleReadCache<T>({
    maxEntries: options?.maxEntries ?? 4,
    freshTtlMs: 10,
    staleTtlMs: 100,
    retryDelayMs: 15,
    now,
    onBackgroundError: options?.onBackgroundError,
  });
}

async function flushTasks(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test('cold load is cached while fresh', async () => {
  let now = 0;
  let calls = 0;
  const cache = createCache<string>(() => now);

  const first = await cache.get('catalog', async () => {
    calls += 1;
    return 'v1';
  });
  now = 10;
  const second = await cache.get('catalog', async () => {
    calls += 1;
    return 'v2';
  });

  assert.equal(first, 'v1');
  assert.equal(second, 'v1');
  assert.equal(calls, 1);
});

test('concurrent cold reads share one in-flight load', async () => {
  const pending = deferred<string>();
  let calls = 0;
  const cache = createCache<string>(() => 0);
  const load = async () => {
    calls += 1;
    return pending.promise;
  };

  const first = cache.get('catalog', load);
  const second = cache.get('catalog', load);
  await Promise.resolve();
  assert.equal(calls, 1);

  pending.resolve('shared');
  assert.deepEqual(await Promise.all([first, second]), ['shared', 'shared']);
});

test('stale read returns immediately and refreshes in background', async () => {
  let now = 0;
  let calls = 0;
  const pending = deferred<string>();
  const cache = createCache<string>(() => now);

  await cache.get('catalog', async () => {
    calls += 1;
    return 'v1';
  });
  now = 11;

  const refresh = async () => {
    calls += 1;
    return pending.promise;
  };
  const stale = await cache.get('catalog', refresh);
  const sharedStale = await cache.get('catalog', refresh);
  assert.equal(stale, 'v1');
  assert.equal(sharedStale, 'v1');
  await Promise.resolve();
  assert.equal(calls, 2);

  pending.resolve('v2');
  await flushTasks();
  assert.equal(await cache.get('catalog', async () => 'unexpected'), 'v2');
});

test('failed background refresh retains stale value and applies retry backoff', async () => {
  let now = 0;
  let calls = 0;
  const errors: unknown[] = [];
  const cache = createCache<string>(() => now, {
    onBackgroundError: (error) => errors.push(error),
  });

  await cache.get('catalog', async () => {
    calls += 1;
    return 'v1';
  });
  const fail = async () => {
    calls += 1;
    throw new Error('database reset');
  };

  now = 11;
  assert.equal(await cache.get('catalog', fail), 'v1');
  await flushTasks();
  assert.equal(calls, 2);
  assert.equal(errors.length, 1);

  now = 25;
  assert.equal(await cache.get('catalog', fail), 'v1');
  await flushTasks();
  assert.equal(calls, 2);

  now = 26;
  assert.equal(await cache.get('catalog', fail), 'v1');
  await flushTasks();
  assert.equal(calls, 3);
  assert.equal(errors.length, 2);
});

test('hard-expired entry propagates a failed cold reload', async () => {
  let now = 0;
  const cache = createCache<string>(() => now);
  await cache.get('catalog', async () => 'v1');

  now = 111;
  await assert.rejects(
    cache.get('catalog', async () => {
      throw new Error('database unavailable');
    }),
    /database unavailable/,
  );
  assert.equal(cache.size, 0);
});

test('least recently used entries are evicted at the configured bound', async () => {
  const cache = createCache<string>(() => 0, { maxEntries: 2 });
  await cache.get('a', async () => 'a1');
  await cache.get('b', async () => 'b1');
  assert.equal(await cache.get('a', async () => 'unexpected'), 'a1');
  await cache.get('c', async () => 'c1');

  let reloads = 0;
  assert.equal(
    await cache.get('b', async () => {
      reloads += 1;
      return 'b2';
    }),
    'b2',
  );
  assert.equal(reloads, 1);
  assert.equal(cache.size, 2);

  cache.clear();
  assert.equal(cache.size, 0);
});

test('pending loads are separate from the bounded settled LRU', async () => {
  const firstPending = deferred<string>();
  const secondPending = deferred<string>();
  const cache = createCache<string>(() => 0, { maxEntries: 1 });
  let firstCalls = 0;

  const loadFirst = async () => {
    firstCalls += 1;
    return firstPending.promise;
  };
  const first = cache.get('first', loadFirst);
  const second = cache.get('second', async () => secondPending.promise);
  const sharedFirst = cache.get('first', loadFirst);
  await Promise.resolve();

  assert.equal(firstCalls, 1);
  assert.equal(cache.size, 0);

  secondPending.resolve('second-value');
  assert.equal(await second, 'second-value');
  assert.equal(cache.size, 1);

  firstPending.resolve('first-value');
  assert.deepEqual(
    await Promise.all([first, sharedFirst]),
    ['first-value', 'first-value'],
  );
  assert.equal(firstCalls, 1);
  assert.equal(cache.size, 1);
  assert.equal(
    await cache.get('second', async () => 'unexpected'),
    'second-value',
  );

  let firstReloads = 0;
  assert.equal(await cache.get('first', async () => {
    firstReloads += 1;
    return 'first-reloaded';
  }), 'first-reloaded');
  assert.equal(firstReloads, 1);
  assert.equal(cache.size, 1);
});

test('clear prevents older in-flight work from refilling or replacing new state', async () => {
  const oldPending = deferred<string>();
  const newPending = deferred<string>();
  const cache = createCache<string>(() => 0, { maxEntries: 1 });

  const oldLoad = cache.get('catalog', async () => oldPending.promise);
  await Promise.resolve();
  cache.clear();
  assert.equal(cache.size, 0);

  const newLoad = cache.get('catalog', async () => newPending.promise);
  await Promise.resolve();
  newPending.resolve('new-value');
  assert.equal(await newLoad, 'new-value');
  assert.equal(cache.size, 1);

  oldPending.resolve('old-value');
  assert.equal(await oldLoad, 'old-value');
  await flushTasks();
  assert.equal(
    await cache.get('catalog', async () => 'unexpected'),
    'new-value',
  );
  assert.equal(cache.size, 1);
});

test('normalized option material is represented by a fixed-length key', () => {
  const first = publicReadCacheKey([1, 30, null, 'popular search', 'popular']);
  const same = publicReadCacheKey([1, 30, null, 'popular search', 'popular']);
  const different = publicReadCacheKey([1, 30, null, 'other search', 'popular']);

  assert.equal(first.length, 64);
  assert.equal(first, same);
  assert.notEqual(first, different);
});
