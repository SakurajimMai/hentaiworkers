import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCompactCount } from '../lib/format-count';

test('counts below a thousand are shown exactly', () => {
  assert.equal(formatCompactCount(0), '0');
  assert.equal(formatCompactCount(7), '7');
  assert.equal(formatCompactCount(999), '999');
});

test('thousands use k and ten-thousands use w, truncated rather than rounded', () => {
  assert.equal(formatCompactCount(1000), '1k', 'a whole thousand drops the decimal');
  assert.equal(formatCompactCount(7887), '7.8k', '7.887k truncates down, it never rounds up to 7.9k');
  assert.equal(formatCompactCount(1099), '1k');
  assert.equal(formatCompactCount(1100), '1.1k');
  assert.equal(formatCompactCount(9999), '9.9k');
  assert.equal(formatCompactCount(10000), '1w', 'ten thousand switches to 万');
  assert.equal(formatCompactCount(32000), '3.2w');
  assert.equal(formatCompactCount(99999), '9.9w');
  assert.equal(formatCompactCount(1_000_000), '100w');
});

test('missing and invalid counts render as zero instead of NaN', () => {
  assert.equal(formatCompactCount(null), '0');
  assert.equal(formatCompactCount(undefined), '0');
  assert.equal(formatCompactCount(Number.NaN), '0');
  assert.equal(formatCompactCount(Number.POSITIVE_INFINITY), '0');
  assert.equal(formatCompactCount(-5), '0');
  assert.equal(formatCompactCount(12.9), '12', 'fractional counts never gain precision');
});
