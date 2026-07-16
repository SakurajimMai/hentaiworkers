import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import {
  createSessionOptions,
  isAdminSessionCookie,
  type SessionData,
} from '@/lib/server/identity/session-config';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // API admin routes enforce requireAdmin in-handler; still gate cookie presence.
  if (pathname.startsWith('/api/admin/')) {
    try {
      const res = NextResponse.next();
      const session = await getIronSession<SessionData>(
        req,
        res,
        createSessionOptions(process.env),
      );
      if (!isAdminSessionCookie(session)) {
        return NextResponse.json(
          { error: { code: 'AUTH_REQUIRED', message: '需要管理员' } },
          { status: 403 },
        );
      }
      return res;
    } catch {
      return NextResponse.json(
        { error: { code: 'AUTH_REQUIRED', message: '需要管理员' } },
        { status: 403 },
      );
    }
  }

  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (pathname === '/admin/login') return NextResponse.next();

  try {
    const res = NextResponse.next();
    const session = await getIronSession<SessionData>(
      req,
      res,
      createSessionOptions(process.env),
    );

    if (!isAdminSessionCookie(session)) {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }

    return res;
  } catch {
    return NextResponse.redirect(new URL('/admin/login', req.url));
  }
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
