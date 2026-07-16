import { NextResponse } from 'next/server';
import { getIdentityService } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

/**
 * Legacy secret reveal endpoint.
 * Compact external-URL mode does not enable the independent crawler secret vault.
 */
export async function GET() {
  try {
    await getIdentityService().requireAdmin();
  } catch {
    return NextResponse.json(
      { error: { code: 'AUTH_REQUIRED', message: '需要管理员登录' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: 'CONFIG_INVALID',
        message: '精简外链采集模式未启用独立爬虫密钥库',
      },
    },
    {
      status: 410,
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    },
  );
}
