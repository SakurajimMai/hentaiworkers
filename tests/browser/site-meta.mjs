import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const repository = resolve(import.meta.dirname, '../..');
const artifacts = process.env.META_BROWSER_ARTIFACTS || await mkdtemp(join(tmpdir(), 'site-meta-browser-'));
await mkdir(artifacts, { recursive: true });
const tags = [
  { attribute: 'name', key: 'google-site-verification', content: 'verification-token' },
  { attribute: 'name', key: 'google-adsense-account', content: 'ca-pub-123' },
  { attribute: 'property', key: 'third-party:verification', content: '"><script>window.metaInjected=true</script>&token' },
];
const serverBundle = await build({
  entryPoints: [join(repository, 'app/layout.tsx')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  plugins: [{
    name: 'metadata-settings-fixture',
    setup(api) {
      api.onResolve({ filter: /^@\/lib\/server\/site-metadata$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: `export async function getGlobalMetaTags() { return ${JSON.stringify(tags)}; }`,
        loader: 'js',
      }));
    },
  }],
});
const layoutModule = { exports: {} };
new Function('module', 'exports', 'require', serverBundle.outputFiles[0].text)(
  layoutModule, layoutModule.exports, createRequire(import.meta.url),
);
const markup = '<!doctype html>' + renderToStaticMarkup(await layoutModule.exports.default({
  children: createElement('main', { id: 'root', className: 'page-shell py-6' }),
}));
const headEnd = markup.indexOf('</head>');
assert.ok(markup.indexOf('google-site-verification') < headEnd, 'verification tags must be in server-rendered head');
assert.ok(!markup.includes('<script>window.metaInjected=true</script>'), 'content is escaped as an attribute');
await writeFile(join(artifacts, 'server-rendered.html'), markup);

const clientBundle = await build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { SiteMetaEditor } from './components/admin/site-meta-editor';
      createRoot(document.getElementById('root')).render(
        <form onSubmit={event => {event.preventDefault(); window.savedMeta = new FormData(event.currentTarget).get('siteMetaTagsJson');}}>
          <h1 className="mb-4 font-ui text-xl">全局 Meta</h1>
          <SiteMetaEditor initialTags={${JSON.stringify(tags)}} />
          <button className="btn-primary mt-4" type="submit">保存设置</button>
        </form>
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
});
const css = await postcss([tailwindcss(join(repository, 'tailwind.config.js'))])
  .process(await readFile(join(repository, 'app/globals.css'), 'utf8'), { from: join(repository, 'app/globals.css') });
const html = markup.replace('</head>', '<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"></head>')
  .replace('</body>', '<script src="/fixture.js"></script></body>');
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(clientBundle.outputFiles[0].text);
  } else if (request.url === '/styles.css') {
    response.writeHead(200, { 'Content-Type': 'text/css' }).end(css.css);
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' }).end(html);
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://fonts.**/*', (route) => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '保存设置' }).waitFor();
    assert.equal(await page.locator('head meta[name="google-site-verification"]').getAttribute('content'), 'verification-token');
    assert.equal(await page.locator('head meta[property="third-party:verification"]').getAttribute('content'), tags[2].content);
    assert.equal(await page.evaluate(() => window.metaInjected), undefined);
    await page.getByRole('button', { name: '保存设置' }).click();
    assert.deepEqual(JSON.parse(await page.evaluate(() => window.savedMeta)), tags);
    await page.getByText('导入验证标签', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Meta 标签', exact: true }).fill('<meta name="msvalidate.01" content="one&amp;two"><meta name="google-site-verification" content="second-token">');
    await page.getByRole('button', { name: '导入', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Meta 4 内容', exact: true }).inputValue(), 'one&two');
    await page.getByRole('textbox', { name: 'Meta 标签', exact: true }).fill('<meta http-equiv="refresh" content="0;url=https://example.com"><script>window.metaInjected=true</script>');
    await page.getByRole('button', { name: '导入', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => window.metaInjected), undefined);
    assert.equal(await page.locator('input[name="siteMetaTagsJson"]').evaluate((input) => JSON.parse(input.value).length), 5);
    await page.screenshot({ path: join(artifacts, `meta-${width}.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no page overflow at ${width}px`);
    for (const label of ['Meta 1 属性', 'Meta 1 名称', 'Meta 1 内容', '删除 Meta 1']) {
      const locator = page.getByLabel(label, { exact: true });
      const box = await locator.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${label} fits viewport`);
      if (label === 'Meta 1 内容') assert.ok(box.width >= 180, 'verification values have readable input width');
    }
    for (let index = 0; index < 5; index += 1) await page.getByRole('button', { name: '删除 Meta 1', exact: true }).click();
    await page.getByRole('button', { name: '添加标签', exact: true }).click();
    await page.getByRole('textbox', { name: 'Meta 1 名称', exact: true }).fill('ad-partner-verification');
    await page.getByRole('textbox', { name: 'Meta 1 内容', exact: true }).fill('manual-token');
    await page.getByRole('button', { name: '保存设置' }).click();
    assert.deepEqual(JSON.parse(await page.evaluate(() => window.savedMeta)), [{ attribute: 'name', key: 'ad-partner-verification', content: 'manual-token' }]);
    await page.getByRole('button', { name: '删除 Meta 1', exact: true }).click();
    await page.getByRole('button', { name: '保存设置' }).click();
    assert.deepEqual(JSON.parse(await page.evaluate(() => window.savedMeta)), []);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(`Global meta SSR and editor checks passed at 1280, 390, 320px. Artifacts: ${artifacts}`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
