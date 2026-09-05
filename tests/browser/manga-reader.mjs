import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import sharp from 'sharp';

const repository = resolve(import.meta.dirname, '../..');
const artifacts = process.env.READER_BROWSER_ARTIFACTS || await mkdtemp(join(tmpdir(), 'reader-browser-'));
await mkdir(artifacts, { recursive: true });
const baselineRef = process.env.READER_BASELINE_REF || 'HEAD';
const baselineCommit = execFileSync('git', ['rev-parse', baselineRef], { cwd: repository, encoding: 'utf8' }).trim();
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const sourceFiles = new Set([
  'components/manga-reader.tsx',
  'components/manga-reader-policy.ts',
  'components/media-image.tsx',
]);
const stubModules = {
  'next/link': `import React from 'react'; export default function Link(props) { return React.createElement('a', props); }`,
  'next/navigation': `export function useRouter() { return { refresh() {}, push(url) { window.__readerNavigation = url; } }; }`,
  '@/app/(site)/auth/actions': `async function toggle(id, returnTo) {
    const response = await fetch('/fixture/favorite', { method: 'POST', body: JSON.stringify({ id, returnTo }) });
    return response.json();
  }
  export const actionToggleFavoriteState = toggle;
  export const actionToggleMangaFavoriteState = toggle;`,
};

async function bundle(baseline) {
  const result = await build({
    entryPoints: [join(import.meta.dirname, 'reader-fixture.tsx')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'reader-fixture-boundaries',
      setup(api) {
        api.onResolve({ filter: /^(next\/link|next\/navigation|@\/app\/\(site\)\/auth\/actions)$/ },
          ({ path }) => ({ path, namespace: 'fixture-stub' }));
        api.onLoad({ filter: /.*/, namespace: 'fixture-stub' }, ({ path }) => ({ contents: stubModules[path], loader: 'jsx', resolveDir: repository }));
        if (baseline) {
          api.onLoad({ filter: /components\/(manga-reader(?:-policy)?|media-image)\.tsx?$/ }, ({ path }) => {
            const relative = path.slice(repository.length + 1);
            if (!sourceFiles.has(relative)) return null;
            return {
              contents: execFileSync('git', ['show', `${baselineCommit}:${relative}`], { cwd: repository, encoding: 'utf8' }),
              loader: path.endsWith('tsx') ? 'tsx' : 'ts',
              resolveDir: join(repository, 'components'),
            };
          });
        }
      },
    }],
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

const bundles = { current: await bundle(false), baseline: await bundle(true) };
const css = await postcss([tailwindcss(join(repository, 'tailwind.config.js'))])
  .process(await readFile(join(repository, 'app/globals.css'), 'utf8'), { from: join(repository, 'app/globals.css') });
const bitmap = await sharp({ create: { width: 900, height: 1280, channels: 3, background: '#a7cfcc' } }).png().toBuffer();
const longBitmap = await sharp({ create: { width: 900, height: 4000, channels: 3, background: '#bdc6e8' } }).png().toBuffer();
const texturePixels = Buffer.alloc(225 * 320 * 3);
let textureSeed = 973;
for (let index = 0; index < texturePixels.length; index += 1) {
  textureSeed = (Math.imul(textureSeed, 1664525) + 1013904223) >>> 0;
  texturePixels[index] = textureSeed >>> 24;
}
const texturedBitmap = await sharp(texturePixels, { raw: { width: 225, height: 320, channels: 3 } })
  .resize(900, 1280, { kernel: 'nearest' }).png().toBuffer();
assert.ok(texturedBitmap.length >= 150_000, 'bandwidth fixture must exercise substantial image transfers');
const records = new Map();
const timers = new Set();
let serial = 0;

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const match = url.pathname.match(/^\/images\/([^/]+)\/(\d+)\/(\d+)\.png$/);
  if (match) {
    const [, run, chapterText, indexText] = match;
    const scenario = records.get(run);
    if (!scenario) { response.writeHead(404).end(); return; }
    const chapter = Number(chapterText);
    const index = Number(indexText);
    const attempt = scenario.requests.filter((entry) => entry.chapter === chapter && entry.index === index).length + 1;
    const entry = { chapter, index, attempt, start: Date.now(), end: null, cancelled: false };
    scenario.requests.push(entry);
    scenario.inFlight += 1;
    scenario.maxInFlight = Math.max(scenario.maxInFlight, scenario.inFlight);
    const delay = scenario.delays?.[index] ?? scenario.delay ?? 180;
    const timer = setTimeout(() => {
      timers.delete(timer);
      const fail = scenario.failOnce?.includes(index) && attempt === 1;
      response.writeHead(fail ? 503 : 200, {
        'Content-Type': 'image/png',
        'Cache-Control': fail ? 'no-store' : 'public, max-age=3600',
      });
      response.end(fail ? 'fixture image failure' : scenario.longPages?.includes(index) ? longBitmap : scenario.largeImages ? texturedBitmap : bitmap);
    }, delay);
    timers.add(timer);
    response.once('close', () => {
      scenario.inFlight -= 1;
      entry.end = Date.now();
      entry.cancelled = !response.writableFinished;
      clearTimeout(timer);
      timers.delete(timer);
    });
    return;
  }
  if (url.pathname.startsWith('/ad/')) {
    const run = url.pathname.split('/')[2];
    records.get(run)?.ads.push({ url: url.pathname, start: Date.now() });
    response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).end(bitmap);
    return;
  }
  if (url.pathname === '/fixture/favorite' || url.pathname.startsWith('/api/me/manga-progress/')) {
    let body = '';
    for await (const chunk of request) body += chunk;
    const run = new URL(request.headers.referer || 'http://localhost').searchParams.get('run');
    const scenario = records.get(run);
    if (url.pathname === '/fixture/favorite') {
      if (scenario) scenario.favorited = !scenario.favorited;
      scenario?.favorites.push(JSON.parse(body));
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, favorited: scenario?.favorited ?? true }));
    } else {
      scenario?.progress.push(JSON.parse(body));
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    }
    return;
  }
  if (url.pathname === '/reader.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(bundles[url.searchParams.get('version') || 'current']);
    return;
  }
  if (url.pathname === '/reader.css') {
    response.writeHead(200, { 'Content-Type': 'text/css' }).end(css.css);
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/reader.css"></head><body><div id="root"></div><script src="/reader.js?version=${url.searchParams.get('version') || 'current'}"></script></body></html>`,
  );
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
} catch (error) {
  await new Promise((done) => server.close(done));
  throw error;
}
const results = [];
const measurements = [];

async function openScenario(name, options = {}) {
  const run = `${name}-${++serial}`;
  const record = { name, requests: [], progress: [], ads: [], favorites: [], inFlight: 0, maxInFlight: 0, ...options };
  records.set(run, record);
  const context = await browser.newContext({
    viewport: options.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    isMobile: Boolean(options.mobile),
    hasTouch: Boolean(options.mobile),
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    window.__readerTiming = [];
    const record = (event) => window.__readerTiming.push({ ...event, at: performance.timeOrigin + performance.now() });
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      record({ type: 'decode-start', src: this.currentSrc || this.src });
      return decode.call(this).then((result) => {
        record({ type: 'decode-end', src: this.currentSrc || this.src });
        return result;
      });
    };
    document.addEventListener('load', (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.classList.contains('reader-image')) return;
      record({ type: 'load', src: image.currentSrc || image.src });
      void image.decode().then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        record({ type: 'readable', src: image.currentSrc || image.src, connected: image.isConnected,
          width: image.naturalWidth, height: image.naturalHeight });
      }))).catch(() => undefined);
    }, true);
    document.addEventListener('DOMContentLoaded', () => {
      const observed = new WeakSet();
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) if (entry.isIntersecting) record({ type: 'visible', index: Number(entry.target.dataset.pageIndex) });
      });
      const register = () => document.querySelectorAll('[data-page-index]').forEach((node) => {
        if (observed.has(node)) return;
        observed.add(node);
        observer.observe(node);
      });
      new MutationObserver(register).observe(document, { childList: true, subtree: true });
      register();
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const network = [];
  cdp.on('Network.requestWillBeSent', (event) => {
    if (event.request.url.includes('/images/')) network.push({ type: 'request', requestId: event.requestId,
      url: event.request.url, priority: event.request.initialPriority, at: event.wallTime * 1000 });
  });
  cdp.on('Network.resourceChangedPriority', (event) => network.push({ type: 'priority', requestId: event.requestId, priority: event.newPriority }));
  cdp.on('Network.requestServedFromCache', (event) => network.push({ type: 'cache', requestId: event.requestId }));
  cdp.on('Network.responseReceived', (event) => {
    if (event.response.url.includes('/images/')) network.push({ type: 'response', requestId: event.requestId,
      url: event.response.url, fromDiskCache: event.response.fromDiskCache });
  });
  if (options.benchmark) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 1_500_000, uploadThroughput: 750_000 });
  }
  const params = new URLSearchParams({ run, count: String(options.count || 80), version: options.version || 'current' });
  if (options.initial !== undefined) params.set('initial', String(options.initial));
  if (options.restored !== undefined) params.set('restored', String(options.restored));
  if (options.omitted) params.set('omitted', options.omitted.join(','));
  if (options.guest) params.set('guest', '1');
  const url = `${origin}/?${params}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-reader-shell]').waitFor();
  return { page, context, record, network, errors, url, async close() {
    const timing = await page.evaluate(() => window.__readerTiming).catch(() => []);
    measurements.push({ run, viewport: options.mobile ? 'mobile' : 'desktop', ...record, network, timing, errors });
    await context.close();
    assert.deepEqual(errors, [], `${name}: browser runtime errors`);
  } };
}

async function waitFor(check, message, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise((done) => setTimeout(done, 20));
  }
}
async function jump(page, index) {
  await page.locator(`[data-page-index="${index}"]`).evaluate((node) => node.scrollIntoView({ behavior: 'instant', block: 'start' }));
}
async function readable(page, index) {
  await page.waitForFunction((target) => window.__readerTiming.some((event) => event.type === 'readable' && event.connected && event.src.endsWith(`/${target}.png`)), index);
}
async function test(name, work) {
  if (process.env.READER_BROWSER_FILTER && !name.includes(process.env.READER_BROWSER_FILTER)) return;
  const start = Date.now();
  try { await work(); results.push({ name, status: 'passed', elapsedMs: Date.now() - start }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}

try {
  for (const mobile of [false, true]) {
    const viewport = mobile ? 'mobile' : 'desktop';
    await test(`${viewport}: delayed initial image, bounded concurrency, ad gate`, async () => {
      const fixture = await openScenario(`delayed-${viewport}`, { mobile, delay: 1100, delays: { 0: 1800 } });
      try {
        await waitFor(() => fixture.record.requests.some((entry) => entry.index === 1), 'next page must start before first settles', 700);
        assert.equal(fixture.record.requests.find((entry) => entry.index === 0)?.end, null);
        assert.equal(fixture.record.ads.length, 0, 'ads must remain gated during initial image loading');
        await fixture.page.waitForTimeout(200);
        assert.ok(fixture.record.requests.length <= (mobile ? 4 : 3), 'opening concurrency is visible pages plus two speculative requests');
        assert.equal(fixture.record.progress.length, 0, 'prefetch must not write progress');
        await readable(fixture.page, 0);
        await waitFor(() => fixture.record.ads.length >= 1, 'ads should execute after initial readability');
        const target = await fixture.page.evaluate(() => performance.getEntriesByName('manga-reader-page-0-readable')[0]?.startTime + performance.timeOrigin);
        assert.ok(fixture.record.ads.every((entry) => entry.start >= target - 2), 'ad requests start after reader decode plus paint marker');
        await fixture.page.waitForTimeout(2500);
        assert.ok(fixture.record.requests.length <= 7, 'opening must stop at finite window, even after requests finish');
        assert.equal(await fixture.page.locator('img.reader-image[fetchpriority="high"]').count(), 1);
        await fixture.page.screenshot({ path: join(artifacts, `${viewport}-reader.png`) });
      } finally { await fixture.close(); }
    });

    await test(`${viewport}: normal scrolling prefetches before viewport and promotes priority`, async () => {
      const fixture = await openScenario(`scroll-${viewport}`, { mobile, delay: 100 });
      try {
        await readable(fixture.page, 0);
        for (let index = 1; index <= 6; index += 1) {
          await waitFor(() => fixture.record.requests.some((entry) => entry.index === index), `page ${index} should be requested before scrolling`);
          await fixture.page.waitForTimeout(180);
          await jump(fixture.page, index);
          await fixture.page.waitForFunction((target) => document.querySelector('header [aria-live]')?.textContent?.includes(`P${target + 1} /`), index);
          assert.equal(await fixture.page.locator(`[data-page-index="${index}"] img`).getAttribute('fetchpriority'), 'high');
          await fixture.page.waitForTimeout(180);
        }
        const timing = await fixture.page.evaluate(() => window.__readerTiming);
        for (let index = 2; index <= 6; index += 1) {
          const visible = timing.find((event) => event.type === 'visible' && event.index === index);
          assert.ok(fixture.record.requests.find((entry) => entry.index === index).start < visible.at, `page ${index} starts before entering viewport`);
        }
        assert.ok(fixture.record.requests.every((entry) => entry.attempt === 1), 'promotion reuses the original image request');
      } finally { await fixture.close(); }
    });

    await test(`${viewport}: rapid jump bypasses occupied speculative slots`, async () => {
      const fixture = await openScenario(`jump-${viewport}`, { mobile, delay: 3000, delays: { 30: 80 } });
      try {
        await waitFor(() => fixture.record.requests.length >= 3, 'initial occupied slots');
        const jumpAt = Date.now();
        await jump(fixture.page, 30);
        await waitFor(() => fixture.record.requests.some((entry) => entry.index === 30), 'visible far page starts immediately', 700);
        const request = fixture.record.requests.find((entry) => entry.index === 30);
        assert.ok(request.start - jumpAt < 650);
        assert.equal(fixture.record.requests.find((entry) => entry.index === 0)?.end, null, 'target bypasses unfinished first image');
        await readable(fixture.page, 30);
        assert.equal(await fixture.page.locator('[data-page-index="30"] img').getAttribute('fetchpriority'), 'high');
        assert.ok(fixture.record.requests.length < 12, 'jump must not drain intervening chapter pages');
        assert.equal(fixture.record.ads.length, 0, 'jumping does not release initial-ad gate early');
      } finally { await fixture.close(); }
    });
  }

  await test('restore middle, reverse direction, progress, favorite and theme', async () => {
    const fixture = await openScenario('restore', { restored: 35, delay: 100 });
    try {
      await readable(fixture.page, 35);
      await fixture.page.waitForTimeout(400);
      assert.equal(await fixture.page.locator('header [aria-live]').textContent(), 'P36 / P80');
      assert.equal(fixture.record.progress.length, 0, 'restoration alone must not write progress');
      assert.ok(fixture.record.requests.every((entry) => entry.index === 0 || Math.abs(entry.index - 35) <= 4));
      for (const index of [34, 33, 32]) {
        await jump(fixture.page, index);
        await fixture.page.waitForTimeout(250);
      }
      await waitFor(() => fixture.record.requests.some((entry) => entry.index === 29), 'reverse reading establishes backward window');
      await fixture.page.waitForTimeout(950);
      assert.equal(fixture.record.progress.at(-1)?.pageIndex, 32);
      assert.equal(await fixture.page.evaluate(() => localStorage.getItem('manga-progress:42:1')), '32');
      await fixture.page.getByRole('button', { name: '收藏', exact: true }).click();
      await fixture.page.getByRole('button', { name: '取消收藏', exact: true }).waitFor();
      assert.equal(fixture.record.favorites.length, 1);
      await fixture.page.getByRole('button', { name: '切换到夜间模式' }).click();
      assert.equal(await fixture.page.locator('html').getAttribute('data-theme'), 'dark');
    } finally { await fixture.close(); }
  });

  await test('visible far page bypasses the initial speculative grace period', async () => {
    const fixture = await openScenario('jump-before-grace', { delay: 3000, delays: { 40: 80 } });
    try {
      await waitFor(() => fixture.record.requests.some((entry) => entry.index === 0), 'initial visible request starts');
      const firstStart = fixture.record.requests.find((entry) => entry.index === 0).start;
      await jump(fixture.page, 40);
      await waitFor(() => fixture.record.requests.some((entry) => entry.index === 40), 'new visible page bypasses grace', 250);
      assert.ok(fixture.record.requests.find((entry) => entry.index === 40).start - firstStart < 280, 'visible request starts before the 300 ms speculative grace expires');
      await readable(fixture.page, 40);
      assert.equal(fixture.record.ads.length, 0);
    } finally { await fixture.close(); }
  });

  await test('failed image releases capacity, keeps retry URL, guest progress remains local', async () => {
    const fixture = await openScenario('failure', { failOnce: [1], delay: 100, guest: true });
    try {
      await fixture.page.locator('[data-page-index="1"]').getByRole('button', { name: '重新加载' }).waitFor();
      await jump(fixture.page, 1);
      await waitFor(() => fixture.record.requests.some((entry) => entry.index === 4), 'failure must release speculative capacity while the reading window moves');
      await fixture.page.locator('[data-page-index="1"]').getByRole('button', { name: '重新加载' }).click();
      await readable(fixture.page, 1);
      assert.equal(fixture.record.requests.filter((entry) => entry.index === 1).length, 2);
      assert.ok(fixture.record.requests.filter((entry) => entry.index !== 1).every((entry) => entry.attempt === 1));
      await fixture.page.waitForTimeout(1000);
      assert.equal(fixture.record.progress.length, 0);
    } finally { await fixture.close(); }
  });

  await test('chapter switch and unmount discard obsolete queue work', async () => {
    const fixture = await openScenario('lifecycle', { delay: 900 });
    try {
      await waitFor(() => fixture.record.requests.length >= 3, 'first chapter starts');
      await fixture.page.evaluate(() => window.readerFixture.changeChapter(2));
      await waitFor(() => fixture.record.requests.some((entry) => entry.chapter === 2 && entry.index === 0), 'new chapter starts without waiting on old slots');
      await fixture.page.waitForTimeout(1100);
      assert.ok(fixture.record.requests.filter((entry) => entry.chapter === 1).length <= 3, 'old completions must not drain old chapter queue');
      await fixture.page.evaluate(() => window.readerFixture.unmount());
      const count = fixture.record.requests.length;
      await fixture.page.waitForTimeout(1300);
      assert.equal(fixture.record.requests.length, count, 'unmounted reader must not start queued images');
    } finally { await fixture.close(); }
  });

  await test('long image geometry and warm browser cache', async () => {
    const fixture = await openScenario('long-warm', { initial: 10, longPages: [10], delay: 100 });
    try {
      await readable(fixture.page, 10);
      const height = await fixture.page.locator('[data-page-index="10"] img').evaluate((image) => image.getBoundingClientRect().height);
      assert.ok(height > 2000, 'long image retains natural aspect ratio');
      await jump(fixture.page, 11);
      await fixture.page.waitForTimeout(300);
      await jump(fixture.page, 10);
      await fixture.page.waitForTimeout(300);
      const before = fixture.record.requests.filter((entry) => entry.index === 10).length;
      await fixture.page.reload({ waitUntil: 'domcontentloaded' });
      await readable(fixture.page, 10);
      assert.equal(fixture.record.requests.filter((entry) => entry.index === 10).length, before, 'warm chapter reuses HTTP image cache');
      assert.ok(fixture.network.some((entry) => entry.type === 'cache' || entry.fromDiskCache), 'cache source is observed through browser network events');
    } finally { await fixture.close(); }
  });

  await test('deleted page indexes cannot strand the last visible page or prefetch slots', async () => {
    const fixture = await openScenario('sparse-pages', { count: 8, omitted: [1, 2], delay: 100 });
    try {
      await readable(fixture.page, 0);
      await waitFor(() => fixture.record.requests.some((entry) => entry.index === 3), 'first surviving neighbor is prefetched');
      await jump(fixture.page, 7);
      await waitFor(() => fixture.record.requests.some((entry) => entry.index === 7), 'last actual index must be admitted despite removed rows');
      await readable(fixture.page, 7);
      assert.equal(await fixture.page.locator('[data-page-index="7"] img').getAttribute('fetchpriority'), 'high');
      await jump(fixture.page, 6);
      await readable(fixture.page, 6);
      assert.ok(fixture.record.requests.every((entry) => ![1, 2].includes(entry.index)), 'deleted rows never consume request slots');
    } finally { await fixture.close(); }
  });

  await test('sparse chapter restores surviving indexes and safely falls back from deleted indexes', async () => {
    for (const restored of [7, 2]) {
      const fixture = await openScenario(`sparse-restore-${restored}`, { count: 8, omitted: [1, 2], restored, delay: 100 });
      try {
        const expected = restored === 7 ? 7 : 0;
        await readable(fixture.page, expected);
        await fixture.page.waitForTimeout(250);
        assert.equal(await fixture.page.locator(`[data-page-index="${expected}"] img`).getAttribute('fetchpriority'), 'high');
        assert.equal(fixture.record.progress.length, 0, 'restoration does not persist a synthetic transition');
        assert.ok(fixture.record.requests.every((entry) => ![1, 2].includes(entry.index)));
      } finally { await fixture.close(); }
    }
  });

  for (const largeImages of [false, true]) {
  await test(`five cold baseline/current runs record initial request and readable timing (${largeImages ? 'textured' : 'small'} image)`, async () => {
    const samples = [];
    for (let run = 0; run < 5; run += 1) {
      for (const version of ['baseline', 'current']) {
        const fixture = await openScenario(`benchmark-${largeImages ? 'textured' : 'small'}-${version}-${run}`, { version, benchmark: true, largeImages, delay: 180 });
        try {
          await readable(fixture.page, 0);
          const data = await fixture.page.evaluate(() => {
            const resource = performance.getEntriesByType('resource').find((entry) => entry.name.endsWith('/1/0.png'));
            const readableEvent = window.__readerTiming.find((event) => event.type === 'readable' && event.src.endsWith('/1/0.png'));
            return {
              requestStart: resource.requestStart,
              responseEnd: resource.responseEnd,
              readable: readableEvent.at - performance.timeOrigin,
              requestToReadable: readableEvent.at - performance.timeOrigin - resource.requestStart,
              priority: document.querySelector('[data-page-index="0"] img')?.fetchPriority,
              activePage: document.querySelector('header [aria-live]')?.textContent,
            };
          });
          samples.push({ version, run, ...data, imageRequestsAtReadable: fixture.record.requests.length });
          assert.equal(data.priority, 'high');
          assert.equal(data.activePage, 'P1 / P80');
        } finally { await fixture.close(); }
      }
    }
    const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const baseline = median(samples.filter((sample) => sample.version === 'baseline').map((sample) => sample.readable));
    const current = median(samples.filter((sample) => sample.version === 'current').map((sample) => sample.readable));
    await writeFile(join(artifacts, largeImages ? 'first-image-textured-comparison.json' : 'first-image-comparison.json'), JSON.stringify({ baselineRef, baselineCommit, conditions: { viewport: '1280x800', cpuSlowdown: 2, latencyMs: 80, downloadBytesPerSecond: 1_500_000, imageResponseDelayMs: 180, imageWidth: 900, imageHeight: 1280, imageBytes: largeImages ? texturedBitmap.length : bitmap.length, imageKind: largeImages ? 'deterministic textured PNG' : 'synthetic solid-color PNG' }, baselineMedianMs: baseline, currentMedianMs: current, samples }, null, 2));
    assert.ok(current <= baseline * 1.2 + 50, `initial readable median regression: baseline=${baseline.toFixed(1)} current=${current.toFixed(1)}`);
  });
  }
} finally {
  await browser.close();
  for (const timer of timers) clearTimeout(timer);
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ results, measurements }, null, 2));
}
console.log(`Reader browser artifacts: ${artifacts}`);
console.log(`${results.filter((result) => result.status === 'passed').length}/${results.length} browser cases passed`);
if (results.some((result) => result.status !== 'passed')) process.exitCode = 1;
