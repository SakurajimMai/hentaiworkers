/**
 * In-process auth rate limiter (login / register / password reset).
 * Suitable for single-instance or best-effort multi-instance protection.
 * Does not replace edge WAF / reverse-proxy limits.
 */

export type AuthRateLimitAction = 'login' | 'register' | 'password_reset';

export type AuthRateLimitDecision = Readonly<{
  allowed: boolean;
  retryAfterSeconds: number;
}>;

type Bucket = {
  count: number;
  windowStartedAt: number;
};

export type AuthRateLimitOptions = Readonly<{
  /** Max attempts per window (default 10). */
  maxAttempts?: number;
  /** Window length in ms (default 15 minutes). */
  windowMs?: number;
  /** Optional clock for tests. */
  now?: () => number;
}>;

const DEFAULT_MAX = 10;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

export class AuthRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: AuthRateLimitOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Check and consume one attempt for the given action + subject key.
   * Subject should combine IP and normalized email when available.
   */
  consume(action: AuthRateLimitAction, subject: string): AuthRateLimitDecision {
    const key = `${action}:${subject || 'anonymous'}`;
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStartedAt >= this.windowMs) {
      bucket = { count: 0, windowStartedAt: now };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= this.maxAttempts) {
      const retryAfterMs = this.windowMs - (now - bucket.windowStartedAt);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Test helper: clear all buckets. */
  reset(): void {
    this.buckets.clear();
  }
}

let shared: AuthRateLimiter | undefined;

export function getAuthRateLimiter(): AuthRateLimiter {
  if (!shared) shared = new AuthRateLimiter();
  return shared;
}

export function setAuthRateLimiterForTests(limiter: AuthRateLimiter | undefined): void {
  shared = limiter;
}

export function authRateLimitSubject(
  remoteIp: string | null | undefined,
  emailOrUsername: string | null | undefined,
): string {
  const ip = (remoteIp || 'unknown').trim() || 'unknown';
  const id = (emailOrUsername || '').trim().toLowerCase() || 'anon';
  return `${ip}|${id}`;
}
