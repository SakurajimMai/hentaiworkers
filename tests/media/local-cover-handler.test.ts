import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLocalCoverHandler } from '../../lib/server/media/local-cover-handler';

const digest = 'c'.repeat(64);

test('serves a local cover with immutable image headers', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'anime-cover-route-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
  });
  const sourceDir = join(root, 'ikun');
  await mkdir(sourceDir);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]);
  await writeFile(join(sourceDir, `${digest}.jpg`), bytes);

  const handler = createLocalCoverHandler({ rootDir: root });
  const response = await handler({ source: 'ikun', filename: `${digest}.jpg` });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(
    response.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
  );
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('content-length'), String(bytes.byteLength));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test('returns 404 for a missing local cover', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'anime-cover-missing-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
  });
  const handler = createLocalCoverHandler({ rootDir: root });

  const response = await handler({ source: 'ikun', filename: `${digest}.webp` });

  assert.equal(response.status, 404);
});

test('rejects paths outside the controlled local cover shape', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'anime-cover-invalid-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
  });
  const handler = createLocalCoverHandler({ rootDir: root });
  const invalid = [
    { source: '..', filename: `${digest}.jpg` },
    { source: '%2e%2e', filename: `${digest}.jpg` },
    { source: 'IKUN', filename: `${digest}.jpg` },
    { source: 'ikun', filename: 'short.jpg' },
    { source: 'ikun', filename: `${digest}.svg` },
    { source: 'ikun', filename: `../${digest}.jpg` },
  ];

  for (const params of invalid) {
    const response = await handler(params);
    assert.equal(response.status, 404, JSON.stringify(params));
  }
});
