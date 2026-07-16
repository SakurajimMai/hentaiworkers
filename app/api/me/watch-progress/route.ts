import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/server/shared/errors';
import { getWatchProgressService } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
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

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '24', 10);
    const items = await getWatchProgressService().listMine(
      Number.isFinite(limit) ? limit : 24,
    );
    return NextResponse.json(
      { data: items },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Merge guest localStorage rows after login. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      rows?: Array<{
        animeId: number;
        positionSeconds: number;
        durationSeconds: number;
        completed?: boolean;
        lastWatchedAt?: string;
      }>;
    };
    const result = await getWatchProgressService().mergeGuestRows(body.rows ?? []);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    await getWatchProgressService().deleteAllMine();
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
