import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readClaimSkipReason } from '../../lib/server/crawler/application/job-progress';

test('claim skip reason parser is safe for absent and invalid progress JSON', () => {
  assert.equal(readClaimSkipReason(null), null);
  assert.equal(readClaimSkipReason('{broken'), null);
  assert.equal(readClaimSkipReason('{}'), null);
  assert.equal(
    readClaimSkipReason(JSON.stringify({ claimSkipReason: '缺少来源 ikun' })),
    '缺少来源 ikun',
  );
});

test('job detail renders the queued claim skip reason', () => {
  const page = readFileSync('app/admin/crawler/jobs/[id]/page.tsx', 'utf8');
  assert.match(page, /readClaimSkipReason/);
  assert.match(page, /领取受阻/);
  assert.match(page, /claimSkipReason/);
});
