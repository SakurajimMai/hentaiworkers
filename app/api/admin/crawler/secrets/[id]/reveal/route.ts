import { NextResponse } from 'next/server';
import { getIdentityService } from '@/lib/server/identity';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { AppError } from '@/lib/server/shared/errors';

export const dynamic = 'force-dynamic';

/**
 * Direct-eye secret reveal: admin session only, no re-auth, Cache-Control: no-store.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await getIdentityService().requireAdmin();
    const { id } = await context.params;
    const secretId = parseInt(id, 10);
    if (!Number.isFinite(secretId)) {
      throw new AppError('RESULT_INVALID', '无效密钥 ID', 400);
    }
    const revealed = await getAdminCrawlerService().revealSecret(secretId);
    return NextResponse.json(
      {
        secretId: revealed.secretId,
        version: revealed.version,
        plaintext: revealed.plaintext,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
      },
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '内部错误' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
