import type { SessionOptions } from 'iron-session';

export const SESSION_COOKIE_NAME = 'animestream_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionData = {
  userId?: number;
  username?: string;
  role?: 'user' | 'admin';
  isLoggedIn: boolean;
};

export type SessionEnv = Readonly<{
  SESSION_SECRET?: string;
  NODE_ENV?: string;
}>;

/**
 * Single source of cookie options for middleware (Edge) and Node session adapter.
 * Do not diverge maxAge/sameSite/name between the two call sites.
 */
export function createSessionOptions(env: SessionEnv = process.env): SessionOptions {
  const password = env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters');
  }

  return {
    password,
    cookieName: SESSION_COOKIE_NAME,
    cookieOptions: {
      secure: env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  };
}

/** Coarse middleware check shape (no DB). */
export function isAdminSessionCookie(data: SessionData | undefined | null): boolean {
  return !!data?.isLoggedIn && data.role === 'admin' && typeof data.userId === 'number';
}
