import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import {
  createSessionOptions,
  isAdminSessionCookie,
  type SessionData,
} from '@/lib/server/identity/session-config';

/**
 * The console is not advertised. Without an admin session every /admin and /api/admin path answers
 * exactly like an unknown URL, and admins sign in through the public /login. Handlers and pages
 * still verify the account against the database (requireAdmin); this is only the cookie gate.
 */
function hidden(req: NextRequest, api: boolean): NextResponse {
  if (api) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }
  // No route matches /404, so the app renders its regular not-found page with a 404 status.
  return NextResponse.rewrite(new URL('/404', req.url));
}

export async function middleware(req: NextRequest) {
  const api = req.nextUrl.pathname.startsWith('/api/admin/');
  try {
    const res = NextResponse.next();
    const session = await getIronSession<SessionData>(req, res, createSessionOptions(process.env));
    if (isAdminSessionCookie(session)) return res;
  } catch {
    // An unreadable cookie is the same as no session.
  }
  return hidden(req, api);
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
