import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const repository = resolve(import.meta.dirname, '../..');
const artifacts = process.env.ADMIN_NAV_BROWSER_ARTIFACTS || await mkdtemp(join(tmpdir(), 'admin-nav-browser-'));
await mkdir(artifacts, { recursive: true });
const executablePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const pathname = '/admin/manga-tags';
const stubModules = {
  'next/link': `import React from 'react';
    export default function Link({ href, prefetch, replace, scroll, ...props }) { return React.createElement('a', { href, ...props }); }`,
  'next/navigation': `export function usePathname() { return ${JSON.stringify(pathname)}; }`,
};
const bundle = await build({
  stdin: {
    // Mirrors app/admin/layout.tsx: the same header above the same shell class.
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { AdminHeader } from './components/admin/admin-header';
      const username = new URLSearchParams(location.search).get('user') || 'administrator';
      createRoot(document.getElementById('root')).render(
        <>
          <AdminHeader username={username} logoutAction={() => {}} />
          <div id="admin-main" className="admin-shell py-8 pb-14">
            <h1 className="font-ui text-xl">漫画标签</h1>
            <nav className="admin-section-nav sticky top-[var(--admin-header-height)] z-20 -mx-1 bg-background px-1 py-2" aria-label="系统设置分区">
              <a href="#one">分区一</a><a href="#two">分区二</a>
            </nav>
            <p style={{ height: '250vh' }}>内容区域</p>
          </div>
        </>
      );`,
    loader: 'tsx',
    resolveDir: repository,
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'admin-nav-fixture-stubs',
    setup(api) {
      api.onResolve({ filter: /^next\/(link|navigation)$/ }, ({ path }) => ({ path, namespace: 'fixture-stub' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture-stub' }, ({ path }) => ({
        contents: stubModules[path], loader: 'jsx', resolveDir: repository,
      }));
    },
  }],
  logLevel: 'silent',
});
const css = await postcss([tailwindcss(join(repository, 'tailwind.config.js'))])
  .process(await readFile(join(repository, 'app/globals.css'), 'utf8'), { from: join(repository, 'app/globals.css') });
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/styles.css"></head>
  <body class="bg-background text-foreground"><div id="root"></div><script src="/fixture.js"></script></body></html>`;
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(bundle.outputFiles[0].text);
  } else if (request.url === '/styles.css') {
    response.writeHead(200, { 'Content-Type': 'text/css' }).end(css.css);
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
  }
});
await new Promise((ready, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', ready);
});

// Widths an operator actually lands on. Browser zoom and OS display scaling divide the
// panel width, so a 1440 screen at 125% reports 1152 CSS pixels and a 1280 screen at
// 125% reports 1024 — the band where the bar used to wrap out of its own height.
const desktopWidths = [1920, 1600, 1536, 1440, 1366, 1280, 1152, 1100, 1024];
const compactWidths = [1023, 900, 768, 600, 414, 360, 320];
let browser;
try {
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  for (const width of [...desktopWidths, ...compactWidths]) {
    const page = await browser.newPage({ viewport: { width, height: 860 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
    const header = page.locator('header');
    await header.waitFor();
    const desktop = desktopWidths.includes(width);
    const nav = page.getByRole('navigation', { name: '后台导航' });
    const menuButton = page.getByRole('button', { name: '打开菜单' });
    assert.equal(await nav.isVisible(), desktop, `full nav visibility at ${width}px`);
    assert.equal(await menuButton.isVisible(), !desktop, `compact menu visibility at ${width}px`);

    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `no horizontal page overflow at ${width}px`,
    );
    const headerBox = await header.boundingBox();
    assert.ok(headerBox.width <= width, `header stays inside the viewport at ${width}px`);

    // Sticky page content offsets itself by --admin-header-height, so the variable has to
    // agree with the header the reader actually sees at this width.
    const declaredHeight = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.height = 'var(--admin-header-height)';
      document.body.append(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    });
    assert.equal(declaredHeight, Math.round(headerBox.height), `--admin-header-height matches the header at ${width}px`);

    // The bar and the page body are measured from the same shell.
    const [barLeft, mainLeft] = await page.evaluate(() => [
      document.querySelector('header > div').getBoundingClientRect().left,
      document.querySelector('#admin-main').getBoundingClientRect().left,
    ]);
    assert.equal(barLeft, mainLeft, `bar aligns with page content at ${width}px`);

    if (desktop) {
      // One row: every link shares the bar's centre line instead of wrapping below it.
      const offCentre = await nav.evaluate((element) => {
        const middle = element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2;
        return [...element.querySelectorAll('a')]
          .filter((link) => {
            const box = link.getBoundingClientRect();
            return Math.abs(box.top + box.height / 2 - middle) > 2;
          })
          .map((link) => link.textContent.trim());
      });
      assert.deepEqual(offCentre, [], `nav links stay on one row at ${width}px`);
      // Every destination is reachable without a scroll gesture on a pointer device.
      const clipped = await nav.evaluate((element) => {
        const bar = element.closest('header').getBoundingClientRect();
        return [...element.querySelectorAll('a')]
          .filter((link) => {
            const box = link.getBoundingClientRect();
            return box.left < 0 || box.right > window.innerWidth || box.top < bar.top || box.bottom > bar.bottom;
          })
          .map((link) => link.textContent.trim());
      });
      assert.deepEqual(clipped, [], `no nav link is clipped at ${width}px`);
      assert.ok(
        await nav.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        `nav needs no horizontal scrolling at ${width}px`,
      );
      const active = nav.locator('a[aria-current="page"]');
      assert.equal(await active.count(), 1, `exactly one active nav link at ${width}px`);
      assert.equal((await active.textContent()).trim(), '漫画标签', `active link tracks the route at ${width}px`);
      assert.equal(await page.getByRole('link', { name: '前台' }).count(), 1, `frontend shortcut stays in the bar at ${width}px`);
      // A crowded bar used to squeeze the trailing controls until 退出 broke across two lines.
      const logout = page.getByRole('button', { name: '退出' });
      assert.ok(
        await logout.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        `the logout label stays on one line at ${width}px`,
      );
      const account = page.getByTitle('打开账户');
      if (await account.isVisible()) {
        assert.ok(
          await account.evaluate((element) => {
            const label = element.querySelector('span:last-child');
            return label.scrollWidth <= label.clientWidth + 1;
          }),
          `the signed-in name is shown in full when the bar offers it at ${width}px`,
        );
      }
    } else {
      await menuButton.click();
      const menu = page.getByRole('navigation', { name: '移动端后台导航' });
      await menu.waitFor();
      assert.equal(await menu.getByRole('link').count(), 9, `every destination is listed at ${width}px`);
      const overflowing = await menu.evaluate((element) => [...element.querySelectorAll('a')]
        .filter((link) => {
          const box = link.getBoundingClientRect();
          return box.left < 0 || box.right > window.innerWidth;
        })
        .map((link) => link.textContent.trim()));
      assert.deepEqual(overflowing, [], `menu links fit the viewport at ${width}px`);
      await page.screenshot({ path: join(artifacts, `admin-nav-menu-${width}.png`) });
      await page.getByRole('button', { name: '收起菜单' }).click();
    }

    // The bar is sticky, and page chrome parks directly beneath it once the page scrolls.
    await page.evaluate(() => window.scrollTo(0, 600));
    const stuck = await header.boundingBox();
    assert.equal(Math.round(stuck.y), 0, `header stays pinned at ${width}px`);
    assert.equal(Math.round(stuck.height), Math.round(headerBox.height), `header height is stable at ${width}px`);
    const sectionNav = page.getByRole('navigation', { name: '系统设置分区' });
    const sectionBox = await sectionNav.boundingBox();
    assert.ok(
      sectionBox.y >= Math.round(stuck.height) - 0.5,
      `sticky section nav clears the header at ${width}px (${sectionBox.y} vs ${stuck.height})`,
    );

    await page.screenshot({ path: join(artifacts, `admin-nav-${width}.png`) });
    assert.deepEqual(errors, [], `no client errors at ${width}px`);
    await page.close();
  }

  // A long account name has to be absorbed by the name badge itself — truncated there
  // rather than pushing the destinations out of the bar.
  for (const width of [1920, 1280, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 860 } });
    await page.goto(`http://127.0.0.1:${server.address().port}?user=${'admin-operator-with-a-long-name'}`, { waitUntil: 'domcontentloaded' });
    await page.locator('header').waitFor();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `a long account name causes no page overflow at ${width}px`,
    );
    const nav = page.getByRole('navigation', { name: '后台导航' });
    if (await nav.isVisible()) {
      assert.ok(
        await nav.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        `a long account name leaves the destinations reachable at ${width}px`,
      );
    }
    await page.screenshot({ path: join(artifacts, `admin-nav-long-name-${width}.png`) });
    await page.close();
  }
  console.log(`Admin navigation checks passed at ${[...desktopWidths, ...compactWidths].join(', ')}px. Artifacts: ${artifacts}`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((closed) => server.close(closed));
}
