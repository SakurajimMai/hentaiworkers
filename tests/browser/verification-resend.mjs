import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const bundle = await build({
  stdin: {
    contents: `import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { VerificationResendButton } from './components/verification-resend-button';
      function App() {
        const [retryAt, setRetryAt] = useState(Date.now() + 120000);
        return <form action={async () => {
          await new Promise(resolve => { window.finishSend = resolve; });
          setRetryAt(Date.now() + 120000);
        }}><VerificationResendButton retryAt={retryAt} initialSeconds={120} /></form>;
      }
      createRoot(document.getElementById('root')).render(<App />);`,
    resolveDir: process.cwd(), loader: 'tsx',
  }, bundle: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(`<div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const button = page.getByRole('button');
  await page.waitForFunction(() => document.querySelector('button')?.textContent === '120s 后可重新发送');
  assert.equal(await button.isDisabled(), true);
  await page.clock.fastForward(119000);
  await page.waitForFunction(() => document.querySelector('button')?.textContent === '1s 后可重新发送');
  assert.equal(await button.isDisabled(), true);
  await page.clock.fastForward(1000);
  await page.waitForFunction(() => !document.querySelector('button')?.disabled);
  await button.click();
  await page.waitForFunction(() => document.querySelector('button')?.textContent === '发送中…');
  assert.equal(await button.isDisabled(), true);
  await page.evaluate(() => window.finishSend());
  await page.waitForFunction(() => document.querySelector('button')?.textContent === '120s 后可重新发送');
  assert.equal(await button.isDisabled(), true);
  console.log('Verification resend countdown and pending-state checks passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
