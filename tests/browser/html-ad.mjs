import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import sharp from 'sharp';

const repository = resolve(import.meta.dirname, '../..');
const artifacts = await mkdtemp(join(tmpdir(), 'html-ad-browser-'));
const bundle = await build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { HtmlAd } from './components/html-ad';
      import { FeedAdCard } from './components/feed-ad-card';
      import { buildPreRollHtml, buildPauseAdBody } from './lib/client/player-ads';
      import { setPlayerHtmlAdsActive } from './lib/client/html-ad';
      const root = createRoot(document.getElementById('root'));
      let serial = 0;
      window.embeddedAds = 0;
      window.addEventListener('message', (event) => { if (event.data?.type === 'embedded-ready') window.embeddedAds += 1; });
      window.renderAd = (options) => {
        const { kind = 'reader', ...props } = options;
        const player = kind === 'preRoll' || kind === 'pause';
        const body = player ? (kind === 'pause'
          ? buildPauseAdBody({ html: props.html, clickUrl: props.clickUrl, videoUrl: '', imageUrl: '', muted: true })
          : buildPreRollHtml({ html: props.html, clickUrl: props.clickUrl, imageUrl: '' })) : '';
        flushSync(() => root.render(<main key={++serial} className={kind === 'reader' ? 'reader-ad reader-ad-banner' : ''}>
          <div id="ad-host" style={{ width: kind === 'feed' ? 230 : '100%', minWidth: 0 }}>
            {player ? <div style={{ width: '100%', height: 300 }} dangerouslySetInnerHTML={{ __html: body }} />
              : kind === 'feed' ? <FeedAdCard {...props} /> : <HtmlAd {...props} />}
          </div></main>));
        if (player && options.active !== false) setPlayerHtmlAdsActive(document.getElementById('ad-host'), true);
      };
      window.activateAd = (active) => setPlayerHtmlAdsActive(document.getElementById('ad-host'), active);`,
    loader: 'jsx',
    resolveDir: repository,
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const css = await postcss([tailwindcss(join(repository, 'tailwind.config.js'))])
  .process(await readFile(join(repository, 'app/globals.css'), 'utf8'), { from: join(repository, 'app/globals.css') });
let origin;
const requests = [];
const beacon = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } }).png().toBuffer();
const server = createServer((request, response) => {
  requests.push(request.url);
  if (request.url === '/fixture.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(bundle.outputFiles[0].text);
  } else if (request.url === '/dependency.js') {
    setTimeout(() => response.writeHead(200, { 'Content-Type': 'text/javascript' }).end('window.adDependency = 42;'), 80);
  } else if (request.url === '/async-ad.js') {
    const nested = `<script src="${origin}/dependency.js"></script><script>document.write('<div id="nested">'+window.adDependency+'</div>')</script>`;
    setTimeout(() => response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(`document.write(${JSON.stringify(nested)});`), 150);
  } else if (request.url === '/embedded') {
    response.writeHead(200, { 'Content-Type': 'text/html' }).end('<p id="embedded">Embedded creative</p><script>top.postMessage({type:"embedded-ready"},"*")</script>');
  } else if (request.url.startsWith('/tick?')) {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }).end(beacon);
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{margin:0;padding:16px;background:#fff;color:#191919}#root{max-width:1200px;margin:auto}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
  page.on('requestfailed', (request) => console.error('Request failed', request.url(), request.failure()?.errorText));
  await page.goto(origin);
  await page.waitForFunction(() => typeof window.renderAd === 'function');

  async function render(options) {
    await page.evaluate((value) => window.renderAd(value), options);
    await page.waitForFunction(() => document.querySelector('#ad-host iframe')?.contentWindow != null);
    const frame = await page.locator('#ad-host iframe').first().elementHandle().then((element) => element.contentFrame());
    await frame.waitForSelector('#hw-ad-content', { state: 'attached' });
    return frame;
  }
  async function heightIs(expected) {
    await page.waitForFunction((wanted) => Math.abs(document.querySelector('#ad-host iframe').getBoundingClientRect().height - wanted) < 2, expected);
  }

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const [width, height] of [[320, 50], [320, 100], [300, 250], [728, 90], [970, 250], [300, 600]]) {
      const frame = await render({ width, height, html: `<div id="creative" style="width:${width}px;height:${height}px;background:#147d72;color:white;font:20px sans-serif;display:grid;place-items:center">${width} x ${height}</div>` });
      const bounds = await page.locator('#ad-host iframe').boundingBox();
      assert.ok(Math.abs(bounds.height - bounds.width * height / width) < 2, `${viewport.width}: ${width}x${height} keeps aspect ratio`);
      assert.ok(bounds.width <= width && bounds.height <= 600);
      const creative = await frame.locator('#creative').boundingBox();
      assert.ok(Math.abs(creative.width - bounds.width) < 2, 'whole creative scales to frame width');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 970) await page.screenshot({ path: join(artifacts, `banner-${viewport.width}.png`) });
    }
  }

  const nestedInline = `<div id="initial">inline</div><script src="${origin}/dependency.js"></script><script>document.write('<div id="parser-nested">'+window.adDependency+'</div>')</script>`;
  const inline = `<script>document.write(${JSON.stringify(nestedInline).replace(/</g, '\\u003c')});</script>`;
  let frame = await render({ html: inline });
  await frame.waitForFunction(() => document.getElementById('initial')?.textContent === 'inline' && document.getElementById('parser-nested')?.textContent === '42').catch(async (error) => {
    console.error(await frame.locator('body').innerHTML());
    throw error;
  });

  frame = await render({ html: `<script async src="${origin}/async-ad.js"></script><div id="retained">retained</div>` });
  await frame.waitForFunction(() => document.getElementById('nested')?.textContent === '42');
  assert.equal(await frame.locator('#retained').count(), 1, 'async document.write must not replace the document');
  assert.equal(await frame.evaluate(() => { try { return Boolean(parent.document.body); } catch { return false; } }), false, 'ad cannot access the parent document');

  frame = await render({ html: '<div id="creative" style="height:280px;background:#147d72"></div>' });
  await heightIs(280);
  await frame.evaluate(() => { document.getElementById('creative').style.height = '50px'; });
  await heightIs(50);
  const id = await frame.evaluate(() => window.__htmlAd.id);
  await page.evaluate((id) => window.postMessage({ type: 'hw-ad-size', id, h: 500 }, '*'), id);
  await page.waitForTimeout(100);
  await heightIs(50);
  await frame.evaluate(() => { document.getElementById('creative').style.height = '5000px'; });
  await heightIs(600);
  await frame.evaluate(() => { document.getElementById('creative').style.height = '32px'; });
  await heightIs(32);

  frame = await render({ width: 320, height: 100, html: `<iframe src="${origin}/embedded" width="320" height="100"></iframe>` });
  await page.waitForFunction(() => document.querySelector('#ad-host iframe')?.getBoundingClientRect().height === 100);
  await page.waitForFunction(() => window.embeddedAds > 0);
  const embeddedPixels = await sharp(await page.locator('#ad-host iframe').screenshot({ path: join(artifacts, 'embedded.png') }))
    .removeAlpha().raw().toBuffer();
  let darkPixels = 0;
  for (let offset = 0; offset < embeddedPixels.length; offset += 3) {
    if (embeddedPixels[offset] < 150 && embeddedPixels[offset + 1] < 150 && embeddedPixels[offset + 2] < 150) darkPixels += 1;
  }
  assert.ok(darkPixels > 30, 'nested document text is painted inside the banner');
  assert.ok(requests.includes('/embedded'));

  for (const kind of ['feed', 'preRoll', 'pause']) {
    frame = await render({ kind, width: 300, height: 250, html: `<script async src="${origin}/async-ad.js"></script>` });
    await frame.waitForFunction(() => document.getElementById('nested')?.textContent === '42');
    assert.ok((await page.locator('#ad-host iframe').boundingBox()).height > 0);
  }

  const heartbeat = `<div id="heartbeat">Ad creative</div><script>setInterval(function(){new Image().src='${origin}/tick?'+Date.now()},40)</script>`;
  for (const kind of ['preRoll', 'pause']) {
    const before = requests.filter((path) => path.startsWith('/tick')).length;
    await page.evaluate((options) => window.renderAd(options), { kind, html: heartbeat, active: false });
    await page.waitForTimeout(120);
    assert.equal(requests.filter((path) => path.startsWith('/tick')).length, before, 'hidden player HTML is not started');
    await page.evaluate(() => window.activateAd(true));
    await page.locator('#ad-host iframe').contentFrame().locator('#heartbeat').waitFor();
    await page.waitForTimeout(150);
    assert.ok(requests.filter((path) => path.startsWith('/tick')).length > before, 'shown HTML starts');
    await page.evaluate(() => window.activateAd(false));
    await page.locator('#ad-host iframe').contentFrame().locator('#heartbeat').waitFor({ state: 'detached' });
    await page.waitForTimeout(100);
    const after = requests.filter((path) => path.startsWith('/tick')).length;
    await page.waitForTimeout(150);
    assert.equal(requests.filter((path) => path.startsWith('/tick')).length, after, 'hidden or skipped HTML stops its scripts');
  }
  for (const clickUrl of [` ${origin}/landing `, ' /landing ']) {
    frame = await render({ kind: 'pause', html: '<div id="click" style="height:100px">Open advertiser</div>', clickUrl });
    const opened = page.waitForEvent('popup');
    await frame.locator('#click').click();
    const popup = await opened;
    await popup.waitForURL(`${origin}/landing`);
    await popup.close();
  }
  assert.deepEqual(errors, []);
  console.log(`HTML ads browser checks passed: desktop/mobile sizes, parser and async nested scripts, source isolation, resizing, embedded pixels, feed/player lifecycle and click URLs. Screenshots: ${artifacts}`);
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
