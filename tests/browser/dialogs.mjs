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
const artifacts = process.env.DIALOG_BROWSER_ARTIFACTS || await mkdtemp(join(tmpdir(), 'dialog-browser-'));
await mkdir(artifacts, { recursive: true });
const bundle = await build({
  stdin: {
    contents: `import React, { useState, StrictMode } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ConfirmSubmitButton } from './components/confirm-submit-button';
      import { ConfirmDialog } from './components/ui/confirm-dialog';
      import { ValidatedForm } from './components/validated-form';
      import { SiteMetaEditor } from './components/admin/site-meta-editor';
      function App() {
        const [count, setCount] = useState(0);
        const [long, setLong] = useState(false);
        const [dynamic, setDynamic] = useState(true);
        const [readonly, setReadonly] = useState(false);
        return <main className="page-shell py-8 space-y-6">
          <h1 className="font-ui text-xl">操作确认与表单校验</h1>
          <output id="count">{count}</output>
          <div style={{ transform: 'translateZ(0)', overflow: 'hidden', maxHeight: 80 }}>
            <ValidatedForm id="delete-form" action={() => setCount(c => c + 1)}>
              <input type="hidden" name="id" value="42" />
              <ConfirmSubmitButton title="删除用户" message="删除后无法恢复，该用户的收藏和浏览记录也会一并清除。" confirmLabel="确认删除" className="btn-danger">删除用户</ConfirmSubmitButton>
            </ValidatedForm>
          </div>
          <ValidatedForm id="fields" action={() => setCount(c => c + 1)} className="surface-card p-6 space-y-4">
            <div><label htmlFor="email" className="admin-label">邮箱</label><input id="email" name="email" type="email" required aria-describedby="email-hint" className="admin-input"/><p id="email-hint">用于接收通知</p></div>
            <div><label htmlFor="password" className="admin-label">密码</label><input id="password" name="password" type="password" required minLength={8} className="admin-input"/></div>
            <div><label htmlFor="code" className="admin-label">验证码</label><input id="code" name="code" required pattern="[0-9]{6}" title="请输入 6 位数字验证码。" className="admin-input"/></div>
            <div><label htmlFor="amount" className="admin-label">数量</label><input id="amount" name="amount" type="number" min={1} max={10} step={1} readOnly={readonly} className="admin-input"/></div>
            <button type="button" onClick={() => setReadonly(v => !v)}>切换只读</button>
            <button type="submit" className="btn-ink">保存</button><button type="reset" className="btn-ghost">重置</button>
            <ConfirmSubmitButton title="确认保存" message="请确认信息。" tone="default" confirmLabel="继续保存" className="btn-ghost">确认后保存</ConfirmSubmitButton>
          </ValidatedForm>
          <ValidatedForm id="dynamic" onSubmit={e => e.preventDefault()} className="surface-card p-6">
            {dynamic && <input name="dynamic" required aria-label="动态字段" className="admin-input"/>}
            <button type="button" onClick={() => setDynamic(v => !v)}>切换字段</button><button type="submit">检查动态字段</button>
          </ValidatedForm>
          <ValidatedForm id="meta" onSubmit={e => e.preventDefault()} className="surface-card p-6">
            <SiteMetaEditor initialTags={[{attribute:'name',key:'',content:''},{attribute:'name',key:'',content:''}]}/>
            <button type="submit">检查 Meta</button>
          </ValidatedForm>
          <ValidatedForm id="row" onSubmit={e => e.preventDefault()} className="flex items-center gap-2">
            <input aria-label="页码" type="number" min={1} max={10} defaultValue={99} className="admin-input !w-16"/>
            <button type="submit" className="btn-ghost">跳转</button>
          </ValidatedForm>
          <button className="btn-ghost" onClick={() => setLong(true)}>长内容</button>
          <ConfirmDialog open={long} title="确认批量删除" message={'很长的内容说明。'.repeat(160)} onCancel={() => setLong(false)} onConfirm={() => setLong(false)}/>
        </main>;
      }
      createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);`,
    loader: 'tsx', resolveDir: repository,
  },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
});
const css = await postcss([tailwindcss(join(repository, 'tailwind.config.js'))])
  .process(await readFile(join(repository, 'app/globals.css'), 'utf8'), { from: join(repository, 'app/globals.css') });
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(bundle.outputFiles[0].text);
  else if (request.url === '/styles.css') response.writeHead(200, { 'Content-Type': 'text/css' }).end(css.css);
  else response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise((ready, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', ready); });
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { errors.push(`Unexpected native dialog: ${dialog.message()}`); await dialog.dismiss(); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const invoker = page.getByRole('button', { name: '删除用户', exact: true });
  const dialog = page.getByRole('alertdialog');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await invoker.click();
      await dialog.waitFor();
      assert.equal(await dialog.evaluate(el => el.matches(':modal')), true);
      assert.equal(await page.evaluate(() => document.activeElement.textContent), '取消');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), '确认删除');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), '取消');
      await dialog.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.height <= 800);
      await page.screenshot({ path: join(artifacts, `confirm-${theme}-${width}.png`) });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await invoker.evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('#count').textContent(), '0');
    }
  }
  await invoker.click();
  await page.mouse.click(2, 2);
  await dialog.waitFor({ state: 'hidden' });
  await invoker.click();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await invoker.click();
  await dialog.getByRole('button', { name: '确认删除' }).evaluate(el => { el.click(); el.click(); });
  await page.waitForFunction(() => document.querySelector('#count').textContent === '1');
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');

  const fields = page.locator('#fields');
  // Every invalid event must be canceled to suppress the browser bubble.
  await fields.evaluate(form => {
    window.invalidEvents = [];
    form.addEventListener('invalid', event => { window.invalidEvents.push(event.defaultPrevented); }, true);
  });
  await fields.getByRole('button', { name: '保存', exact: true }).click();
  assert.equal(await fields.locator('.form-field-error').count(), 3);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'email');
  assert.deepEqual(await page.evaluate(() => window.invalidEvents), [true, true, true]);
  assert.equal(await page.locator('#count').textContent(), '1');
  await page.locator('#email').fill('bad');
  assert.equal(await page.locator('#email + .form-field-error').textContent(), '请输入有效的邮箱地址。');
  await page.locator('#email').fill('reader@example.com');
  assert.equal(await page.locator('#email').getAttribute('aria-describedby'), 'email-hint');
  await page.locator('#password').fill('tiny');
  await page.locator('#code').fill('abc');
  await page.locator('#amount').fill('11');
  await fields.getByRole('button', { name: '保存', exact: true }).click();
  assert.match(await page.locator('#password + .form-field-error').textContent(), /8/);
  assert.match(await page.locator('#code + .form-field-error').textContent(), /6/);
  assert.match(await page.locator('#amount + .form-field-error').textContent(), /10/);
  await fields.getByRole('button', { name: '切换只读' }).click();
  await page.waitForFunction(() => !document.querySelector('#amount').hasAttribute('aria-invalid'));
  await fields.getByRole('button', { name: '切换只读' }).click();
  await page.locator('#amount').fill('1.5');
  await fields.getByRole('button', { name: '保存', exact: true }).click();
  assert.match(await page.locator('#amount + .form-field-error').textContent(), /步长/);
  await page.locator('#amount').fill('0');
  assert.match(await page.locator('#amount + .form-field-error').textContent(), /不小于/);
  await page.screenshot({ path: join(artifacts, 'validation-mobile.png'), fullPage: true });
  await fields.getByRole('button', { name: '确认后保存' }).click();
  await dialog.getByRole('button', { name: '继续保存' }).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'password');
  assert.equal(await page.locator('#count').textContent(), '1');
  await fields.getByRole('button', { name: '重置' }).click();
  assert.equal(await fields.locator('.form-field-error').count(), 0);
  await page.locator('#email').fill('reader@example.com');
  await page.locator('#password').fill('long-password');
  await page.locator('#code').fill('123456');
  await page.locator('#amount').fill('3');
  await fields.getByRole('button', { name: '确认后保存' }).click();
  await dialog.getByRole('button', { name: '继续保存' }).click();
  await page.waitForFunction(() => document.querySelector('#count').textContent === '2');

  await page.getByRole('button', { name: '检查动态字段' }).click();
  assert.equal(await page.locator('#dynamic .form-field-error').count(), 1);
  await page.getByRole('button', { name: '切换字段' }).click();
  await page.waitForFunction(() => !document.querySelector('#dynamic .form-field-error'));
  await page.getByRole('button', { name: '切换字段' }).click();
  await page.getByRole('button', { name: '检查动态字段' }).click();
  assert.equal(await page.locator('#dynamic .form-field-error').count(), 1);
  await page.getByRole('button', { name: '检查 Meta', exact: true }).click();
  assert.equal(await page.locator('#meta .form-field-error').count(), 4);
  await page.getByRole('button', { name: '删除 Meta 1', exact: true }).click();
  assert.equal(await page.locator('#meta input[aria-label]').count(), 2);
  await page.getByRole('textbox', { name: 'Meta 1 名称', exact: true }).fill('verification');
  await page.getByRole('textbox', { name: 'Meta 1 内容', exact: true }).fill('token');
  assert.equal(await page.locator('#meta .form-field-error').count(), 0);

  await page.getByRole('button', { name: '跳转', exact: true }).click();
  const rowError = await page.locator('#row .form-field-error').boundingBox();
  const rowInput = await page.getByRole('spinbutton', { name: '页码' }).boundingBox();
  assert.ok(rowError.y >= rowInput.y + rowInput.height, 'inline rows put feedback below their controls');
  assert.ok(rowError.x >= 0 && rowError.x + rowError.width <= 320, 'row feedback fits mobile viewport');
  await page.screenshot({ path: join(artifacts, 'validation-row-mobile.png') });

  // Explicit theme overrides and OS theme selection both reach the modal surface.
  await page.evaluate(() => delete document.documentElement.dataset.theme);
  await page.emulateMedia({ colorScheme: 'light' });
  await invoker.click();
  const lightSurface = await dialog.locator(':scope > div').evaluate(el => getComputedStyle(el).backgroundColor);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ colorScheme: 'dark' });
  await invoker.click();
  const darkSurface = await dialog.locator(':scope > div').evaluate(el => getComputedStyle(el).backgroundColor);
  assert.notEqual(lightSurface, darkSurface);
  await page.keyboard.press('Escape');

  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.getByRole('button', { name: '长内容', exact: true }).click();
  assert.equal(await dialog.evaluate(el => getComputedStyle(el).animationName), 'none');
  const confirmBox = await dialog.getByRole('button', { name: '确定', exact: true }).boundingBox();
  assert.ok(confirmBox.y >= 0 && confirmBox.y + confirmBox.height <= 320);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.scrollHeight > document.activeElement.clientHeight), true, 'long content is keyboard reachable');
  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => document.activeElement.scrollTop > 0);
  await page.screenshot({ path: join(artifacts, 'confirm-long-landscape.png') });
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log(`Dialog and validation browser checks passed. Artifacts: ${artifacts}`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(closed => server.close(closed));
}
