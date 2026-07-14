import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveHandler } from '../../app/api/live/handler';
import { createReadyHandler } from '../../app/api/ready/handler';

test('live always 200', async () => {
  const res = await createLiveHandler()();
  assert.equal(res.status, 200);
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, 'live');
});

test('ready 200 when check ok; 503 when not', async () => {
  const ok = await createReadyHandler(async () => ({ ok: true }))();
  assert.equal(ok.status, 200);

  const bad = await createReadyHandler(async () => ({
    ok: false,
    reason: 'db',
  }))();
  assert.equal(bad.status, 503);
  const body = (await bad.json()) as { status: string; reason: string };
  assert.equal(body.status, 'not_ready');
  assert.equal(body.reason, 'db');
});
