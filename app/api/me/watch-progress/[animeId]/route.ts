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

async function parseAnimeId(params: Promise<{ animeId: string }>): Promise<number> {
  const { animeId } = await params;
  const id = parseInt(animeId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError('RESULT_INVALID', '无效的作品 ID', 400);
  }
  return id;
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ animeId: string }> },
) {
  try {
    const animeId = await parseAnimeId(context.params);
    const row = await getWatchProgressService().getMine(animeId);
    return NextResponse.json(
      { data: row },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ animeId: string }> },
) {
  try {
    const animeId = await parseAnimeId(context.params);
    const body = (await req.json()) as {
      positionSeconds?: number;
      durationSeconds?: number;
      completed?: boolean;
      force?: boolean;
      clientEvent?:
        | 'play_start'
        | 'play_progress'
        | 'play_25_percent'
        | 'play_50_percent'
        | 'play_75_percent'
        | 'play_complete'
        | 'pause'
        | null;
    };
    if (body.positionSeconds == null || !Number.isFinite(Number(body.positionSeconds))) {
      throw new AppError('RESULT_INVALID', 'positionSeconds 必填', 400);
    }
    // force is server-only (guest merge). Ignore client-supplied force on public PUT.
    const row = await getWatchProgressService().upsertMine(animeId, {
      positionSeconds: Number(body.positionSeconds),
      durationSeconds: body.durationSeconds == null ? undefined : Number(body.durationSeconds),
      completed: body.completed,
      force: false,
      clientEvent: body.clientEvent ?? null,
    });
    return NextResponse.json(
      { data: row },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ animeId: string }> },
) {
  try {
    const animeId = await parseAnimeId(context.params);
    await getWatchProgressService().deleteMine(animeId);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
