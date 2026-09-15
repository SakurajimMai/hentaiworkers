import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageProxyHandler, LEGACY_HOST_ATTEMPTS } from '../../app/cdn-img/[...path]/handler';
import {
  encodeImagePath,
  hostsFromUrls,
  imageProxyDomain,
  isProxiedImageHost,
  parseImageProxyPath,
} from '../../lib/server/image-proxy';

const SITE = 'https://www.site.example';

test('the proxy scope is the site parent domain, guarded against two-label public suffixes', () => {
  // Same examples as MediaUrlNormalizerTest on Android; both sides must agree.
  assert.equal(imageProxyDomain('https://www.site.example'), 'site.example');
  assert.equal(imageProxyDomain('https://site.example'), 'site.example');
  assert.equal(imageProxyDomain('https://app.site.example:8443/'), 'site.example');
  assert.equal(imageProxyDomain('https://example.co.uk'), 'example.co.uk');
  assert.equal(imageProxyDomain('https://www.example.co.uk'), 'example.co.uk');
  assert.equal(imageProxyDomain('http://localhost:3000'), 'localhost');
});

test('any host under the domain is proxied except the site itself', () => {
  assert.equal(isProxiedImageHost('image1.site.example', SITE), true);
  assert.equal(isProxiedImageHost('IMAGE2.site.example', SITE), true);
  assert.equal(isProxiedImageHost('cdn.eu.site.example', SITE), true);
  assert.equal(isProxiedImageHost('site.example', SITE), true);
  assert.equal(isProxiedImageHost('www.site.example', SITE), false, 'the site itself is never proxied');
  assert.equal(isProxiedImageHost('site.example.evil', SITE), false);
  assert.equal(isProxiedImageHost('evilsite.example', SITE), false);
  assert.equal(isProxiedImageHost('static.other.example', SITE), false);
  assert.equal(isProxiedImageHost('', SITE), false);
});

test('parseImageProxyPath distinguishes host, legacy, forbidden and invalid paths', () => {
  assert.deepEqual(parseImageProxyPath(['image2.site.example', 'file', 'a b.jpg'], SITE), {
    kind: 'host',
    host: 'image2.site.example',
    path: 'file/a%20b.jpg',
  });
  assert.deepEqual(parseImageProxyPath(['Image2.Site.Example:8443', 'file', 'a.jpg'], SITE), {
    kind: 'host',
    host: 'image2.site.example:8443',
    path: 'file/a.jpg',
  });
  assert.deepEqual(parseImageProxyPath(['file', '1789428684105_eh4190145-001.jpg'], SITE), {
    kind: 'legacy',
    path: 'file/1789428684105_eh4190145-001.jpg',
  }, 'pre-Build-112 clients send no host segment');
  assert.deepEqual(parseImageProxyPath(['other.example', 'file', 'a.jpg'], SITE), {
    kind: 'forbidden',
    host: 'other.example',
  });
  assert.deepEqual(
    parseImageProxyPath(['www.site.example', 'cdn-img', 'x.jpg'], SITE),
    { kind: 'forbidden', host: 'www.site.example' },
    'the proxy never fetches from itself',
  );
  assert.deepEqual(parseImageProxyPath([], SITE), { kind: 'invalid' });
  assert.deepEqual(parseImageProxyPath(['image2.site.example'], SITE), { kind: 'invalid' }, 'a host without a file');
  assert.deepEqual(parseImageProxyPath(['image2.site.example', '..', 'etc'], SITE), { kind: 'invalid' });
  assert.deepEqual(parseImageProxyPath(['image2.site.example:70000', 'a.jpg'], SITE), { kind: 'invalid' });
  assert.deepEqual(parseImageProxyPath(['..', 'a.jpg'], SITE), { kind: 'invalid' });
  assert.equal(encodeImagePath(['file', 'манга 1.jpg']), 'file/%D0%BC%D0%B0%D0%BD%D0%B3%D0%B0%201.jpg');
});

test('hostsFromUrls keeps distinct hosts in first-seen order and skips junk', () => {
  assert.deepEqual(
    hostsFromUrls([
      'https://image2.site.example/file/a.jpg',
      null,
      'https://IMAGE2.site.example/file/b.jpg',
      'not a url',
      undefined,
      'https://image1.site.example/file/c.jpg',
      '',
    ]),
    ['image2.site.example', 'image1.site.example'],
  );
});

type Call = { url: string; accept: string | null };

function imageResponse(type = 'image/jpeg') {
  return new Response(Buffer.from('img'), { status: 200, headers: { 'content-type': type, 'content-length': '3' } });
}

function proxy(options: {
  respond: (url: string) => Response | Promise<Response>;
  legacyHosts?: () => Promise<readonly string[]>;
  siteOrigin?: () => string;
}) {
  const calls: Call[] = [];
  const handler = createImageProxyHandler({
    siteOrigin: options.siteOrigin ?? (() => SITE),
    legacyHosts: options.legacyHosts ?? (async () => []),
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, accept: headers.get('accept') });
      return options.respond(url);
    }) as typeof fetch,
  });
  const get = (segments: string[], query = '') =>
    handler(
      new Request(`${SITE}/cdn-img/${segments.join('/')}${query}`, { headers: { accept: 'image/webp' } }),
      { params: Promise.resolve({ path: segments }) },
    );
  return { calls, get };
}

test('a host under the site domain is fetched over https with the query and Accept forwarded', async () => {
  const { calls, get } = proxy({ respond: () => imageResponse('image/webp') });

  const response = await get(['image2.site.example', 'file', 'a.jpg'], '?w=900');

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('content-length'), '3');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=2592000, immutable');
  assert.deepEqual(calls, [{ url: 'https://image2.site.example/file/a.jpg?w=900', accept: 'image/webp' }]);
});

test('hosts outside the domain, the site itself and malformed paths are refused without a fetch', async () => {
  const { calls, get } = proxy({ respond: () => imageResponse() });

  assert.equal((await get(['other.example', 'file', 'a.jpg'])).status, 403);
  assert.equal((await get(['www.site.example', 'cdn-img', 'a.jpg'])).status, 403);
  assert.equal((await get(['image2.site.example', '..', 'a.jpg'])).status, 400);
  assert.equal((await get(['image2.site.example'])).status, 400);
  assert.equal(calls.length, 0);
});

test('upstream failures pass through uncached so the app can fall back or retry later', async () => {
  const statuses = new Map<string, () => Response>([
    ['https://image2.site.example/file/missing.jpg', () => new Response('nope', { status: 404 })],
    ['https://image2.site.example/file/html.jpg', () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['https://image2.site.example/file/down.jpg', () => new Response('', { status: 503 })],
  ]);
  const { get } = proxy({
    respond: (url) => {
      const make = statuses.get(url);
      if (!make) throw new TypeError('fetch failed');
      return make();
    },
  });

  const missing = await get(['image2.site.example', 'file', 'missing.jpg']);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal((await get(['image2.site.example', 'file', 'html.jpg'])).status, 404, 'non-image bodies are not relayed');
  assert.equal((await get(['image2.site.example', 'file', 'down.jpg'])).status, 503, 'a 5xx reaches the app, which then loads directly');
  assert.equal((await get(['image2.site.example', 'file', 'unreachable.jpg'])).status, 502);
});

test('a legacy path without a host tries the catalog hosts inside the domain in order', async () => {
  const { calls, get } = proxy({
    legacyHosts: async () => ['image1.site.example', 'cdn.other.example', 'image2.site.example'],
    respond: (url) => (url.startsWith('https://image2.') ? imageResponse() : new Response('', { status: 404 })),
  });

  const response = await get(['file', '1789428684105_eh4190145-001.jpg'], '?w=1');

  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      'https://image1.site.example/file/1789428684105_eh4190145-001.jpg?w=1',
      'https://image2.site.example/file/1789428684105_eh4190145-001.jpg?w=1',
    ],
    'hosts outside the domain are skipped even when the catalog names them',
  );
});

test('a legacy path gives up after the bounded host list and reports host lookup failures as 503', async () => {
  const many = Array.from({ length: LEGACY_HOST_ATTEMPTS + 3 }, (_, index) => `image${index}.site.example`);
  const exhausted = proxy({ legacyHosts: async () => many, respond: () => new Response('', { status: 404 }) });
  assert.equal((await exhausted.get(['file', 'a.jpg'])).status, 404);
  assert.equal(exhausted.calls.length, LEGACY_HOST_ATTEMPTS);

  const noHosts = proxy({ respond: () => imageResponse() });
  assert.equal((await noHosts.get(['file', 'a.jpg'])).status, 404);
  assert.equal(noHosts.calls.length, 0);

  const databaseDown = proxy({
    legacyHosts: async () => {
      throw new Error('database unavailable');
    },
    respond: () => imageResponse(),
  });
  const response = await databaseDown.get(['file', 'a.jpg']);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('an unusable SITE_URL disables the proxy instead of guessing a scope', async () => {
  const { calls, get } = proxy({
    respond: () => imageResponse(),
    siteOrigin: () => {
      throw new Error('SITE_URL 在生产环境中必须显式配置');
    },
  });

  assert.equal((await get(['image2.site.example', 'file', 'a.jpg'])).status, 503);
  assert.equal(calls.length, 0);
});
