import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/server/shared/errors';
import { getSystemSettingsService } from '@/lib/server/system';

export const dynamic = 'force-dynamic';

function publicUser(user: {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      emailOrUsername?: string;
      email?: string;
      password?: string;
    };
    const emailOrUsername = String(body.emailOrUsername || body.email || '').trim();
    const password = String(body.password || '');
    if (!emailOrUsername || !password) {
      return NextResponse.json({ error: '请输入账号和密码' }, { status: 400 });
    }
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip');
    const user = await getSystemSettingsService().loginPublic({
      emailOrUsername,
      password,
      remoteIp: ip,
      skipTurnstile: true,
    });
    if (!user) {
      return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
    }
    return NextResponse.json(
      { user: publicUser(user) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status || 400 },
      );
    }
    return NextResponse.json({ error: '登录失败' }, { status: 500 });
  }
}
