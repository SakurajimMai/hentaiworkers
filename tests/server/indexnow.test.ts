import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_MAX_URLS,
  buildIndexNowPayload,
  createIndexNowKeyHandler,
  indexNowKeyPath,
  isValidIndexNowKey,
  submitIndexNow,
} from '../../lib/server/seo/indexnow';
import {
  animeIndexNowPaths,
  animeTagIndexNowPaths,
  mangaIndexNowPaths,
  mangaTagIndexNowPaths,
} from '../../lib/server/seo/notify-indexnow';
import { parseIndexNowKeyFromForm } from '../../lib/server/system/domain/site-settings-form';

const KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

test('IndexNow keys follow the protocol character set and length', () => {
  assert.equal(isValidIndexNowKey(KEY), true);
  assert.equal(isValidIndexNowKey('short'), false);
  assert.equal(isValidIndexNowKey('has space 12345'), false);
  assert.equal(isValidIndexNowKey('x'.repeat(129)), false);
  assert.equal(indexNowKeyPath(KEY), `/indexnow/${KEY}.txt`);
});

test('payload keeps same-origin absolute urls, dedupes and caps the list', () => {
  const payload = buildIndexNowPayload('https://www.example.com', KEY, [
    '/manga/11',
    'https://www.example.com/manga/11#top',
    '/manga',
    ' ',
    'https://evil.example/manga/1',
    'http://[unclosed',
  ]);
  assert.deepEqual(payload, {
    host: 'www.example.com',
    key: KEY,
    keyLocation: `https://www.example.com/indexnow/${KEY}.txt`,
    urlList: ['https://www.example.com/manga/11', 'https://www.example.com/manga'],
  });
  assert.equal(buildIndexNowPayload('https://www.example.com', 'bad key', ['/manga']), null);
  assert.equal(buildIndexNowPayload('https://www.example.com', KEY, ['https://evil.example/']), null);
  const capped = buildIndexNowPayload(
    'https://www.example.com',
    KEY,
    Array.from({ length: INDEXNOW_MAX_URLS + 5 }, (_, index) => `/watch/${index}`),
  );
  assert.equal(capped?.urlList.length, INDEXNOW_MAX_URLS);
});

test('submit posts json to the IndexNow endpoint and skips work without valid input', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response('', { status: 202 });
  }) as typeof fetch;

  const result = await submitIndexNow({ siteUrl: 'https://www.example.com', key: KEY, paths: ['/manga/3'], fetchImpl });
  assert.deepEqual(result, { submitted: 1, status: 202 });
  assert.equal(calls[0].url, INDEXNOW_ENDPOINT);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(new Headers(calls[0].init.headers).get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)).urlList, ['https://www.example.com/manga/3']);

  const skipped = await submitIndexNow({ siteUrl: 'https://www.example.com', key: '', paths: ['/manga/3'], fetchImpl });
  assert.deepEqual(skipped, { submitted: 0, status: null });
  assert.equal(calls.length, 1);
});

test('key file handler only serves the configured key under its own file name', async () => {
  const handler = createIndexNowKeyHandler(async () => KEY);
  const ok = await handler(new Request('https://www.example.com/indexnow/x'), { params: Promise.resolve({ file: `${KEY}.txt` }) });
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), KEY);
  assert.equal(ok.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(ok.headers.get('x-robots-tag'), 'noindex');

  const wrongName = await handler(new Request('https://www.example.com/indexnow/x'), { params: Promise.resolve({ file: 'other.txt' }) });
  assert.equal(wrongName.status, 404);
  const disabled = createIndexNowKeyHandler(async () => '');
  const missing = await disabled(new Request('https://www.example.com/indexnow/x'), { params: Promise.resolve({ file: '.txt' }) });
  assert.equal(missing.status, 404);
  const failing = createIndexNowKeyHandler(async () => { throw new Error('db down'); });
  const unavailable = await failing(new Request('https://www.example.com/indexnow/x'), { params: Promise.resolve({ file: `${KEY}.txt` }) });
  assert.equal(unavailable.status, 503);
});

test('tag mutations submit the listing URL the sitemap publishes', () => {
  // Renaming or deleting a tag changes a URL that is already in the sitemap.
  assert.deepEqual(animeTagIndexNowPaths(42), ['/browse?tag=42', '/browse']);
  assert.deepEqual(animeTagIndexNowPaths(null), ['/browse']);
  // Curation is exactly what decides whether a manga tag page is indexable.
  assert.deepEqual(mangaTagIndexNowPaths('NTR'), ['/manga?tag=NTR', '/manga']);
  assert.deepEqual(
    mangaTagIndexNowPaths('旧名', '新名'),
    [`/manga?tag=${encodeURIComponent('新名')}`, `/manga?tag=${encodeURIComponent('旧名')}`, '/manga'],
    'a rename submits both the old and the new listing',
  );
  assert.deepEqual(mangaTagIndexNowPaths('  ', null, undefined), ['/manga']);
});

test('content change paths cover the detail page and its listing hubs', () => {
  assert.deepEqual(animeIndexNowPaths(12), ['/watch/12', '/', '/browse']);
  assert.deepEqual(animeIndexNowPaths(null), ['/', '/browse']);
  assert.deepEqual(mangaIndexNowPaths(7), ['/manga/7', '/manga', '/']);
  assert.deepEqual(mangaIndexNowPaths(undefined), ['/manga', '/']);
});

test('settings form accepts an empty or valid IndexNow key and rejects malformed ones', () => {
  const form = new FormData();
  assert.equal(parseIndexNowKeyFromForm(form), '');
  form.set('indexNowKey', `  ${KEY}  `);
  assert.equal(parseIndexNowKeyFromForm(form), KEY);
  form.set('indexNowKey', 'not valid!');
  assert.throws(() => parseIndexNowKeyFromForm(form), /IndexNow/);
});
