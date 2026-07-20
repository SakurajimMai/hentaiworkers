import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deriveWorkerDisplayState } from '../../lib/server/crawler/application/worker-display-state';

const baseWorker = {
  id: 1,
  name: 'worker-1',
  version: '1.0.0',
  capabilitiesJson: JSON.stringify({ sources: ['ikun'], currentLoad: 0 }),
  lastHeartbeatAt: '2026-07-20T00:00:00.000Z',
  isEnabled: true,
  claimEnabled: true,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
} as const;

test('worker display state distinguishes online, draining, paused, and disabled', () => {
  const now = new Date('2026-07-20T00:01:00.000Z').getTime();
  assert.deepEqual(deriveWorkerDisplayState(baseWorker, now), {
    connection: 'online',
    lifecycle: 'active',
    currentLoad: 0,
    sources: ['ikun'],
  });
  assert.equal(
    deriveWorkerDisplayState({
      ...baseWorker,
      claimEnabled: false,
      capabilitiesJson: JSON.stringify({ sources: ['ikun'], currentLoad: 1 }),
    }, now).lifecycle,
    'draining',
  );
  assert.equal(
    deriveWorkerDisplayState({ ...baseWorker, claimEnabled: false }, now).lifecycle,
    'paused',
  );
  assert.equal(
    deriveWorkerDisplayState({ ...baseWorker, isEnabled: false }, now).lifecycle,
    'disabled',
  );
  assert.equal(
    deriveWorkerDisplayState({ ...baseWorker, lastHeartbeatAt: null }, now).connection,
    'offline',
  );
});

test('worker page exposes lifecycle operations with protected destructive actions', () => {
  const page = readFileSync('app/admin/crawler/workers/page.tsx', 'utf8');
  const actions = readFileSync('components/admin/crawler/worker-actions.tsx', 'utf8');
  assert.match(page, /deriveWorkerDisplayState/);
  assert.match(page, /WorkerActions/);
  assert.match(actions, /claimEnabled \? 'pause' : 'resume'/);
  assert.match(actions, /isEnabled \? 'disable' : 'enable'/);
  for (const operation of ['rotate', 'revoke']) {
    assert.match(actions, new RegExp(`hidden\\(["']${operation}["']\\)`));
  }
  assert.match(actions, /ConfirmSubmitButton/);
  assert.match(actions, /离开或刷新本页后无法再次查看/);
});
