import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuthRateLimiter,
  authRateLimitSubject,
} from '../../lib/server/identity/application/auth-rate-limit';

test('auth rate limiter allows up to max then blocks', () => {
  let now = 1_000_000;
  const limiter = new AuthRateLimiter({
    maxAttempts: 3,
    windowMs: 60_000,
    now: () => now,
  });
  assert.equal(limiter.consume('login', 'ip|a').allowed, true);
  assert.equal(limiter.consume('login', 'ip|a').allowed, true);
  assert.equal(limiter.consume('login', 'ip|a').allowed, true);
  const blocked = limiter.consume('login', 'ip|a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);

  // Different subject is independent.
  assert.equal(limiter.consume('login', 'ip|b').allowed, true);

  // Window rollover clears bucket.
  now += 61_000;
  assert.equal(limiter.consume('login', 'ip|a').allowed, true);
});

test('authRateLimitSubject normalizes email and ip', () => {
  assert.equal(authRateLimitSubject(' 1.2.3.4 ', ' Alice@Ex.com '), '1.2.3.4|alice@ex.com');
  assert.equal(authRateLimitSubject(null, null), 'unknown|anon');
});
