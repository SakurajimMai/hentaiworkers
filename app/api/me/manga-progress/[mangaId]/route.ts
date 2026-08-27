import { NextRequest } from 'next/server';
import { AppError } from '@/lib/server/shared/errors';
import { deleteMangaProgress, upsertMangaProgress } from '@/lib/server/manga-progress';
import { meError, meJson } from '../../http';

export const dynamic = 'force-dynamic';

async function parseMangaId(params: Promise<{ mangaId: string }>): Promise<number> {
  const { mangaId } = await params;
  const id = parseInt(mangaId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError('RESULT_INVALID', '无效的漫画 ID', 400);
  }
  return id;
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ mangaId: string }> },
) {
  try {
    const mangaId = await parseMangaId(context.params);
    const body = (await req.json()) as { chapterNumber?: unknown; pageIndex?: unknown };
    const row = await upsertMangaProgress(mangaId, body);
    return meJson({ data: row });
  } catch (error) {
    return meError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ mangaId: string }> },
) {
  try {
    const mangaId = await parseMangaId(context.params);
    await deleteMangaProgress(mangaId);
    return meJson({ ok: true });
  } catch (error) {
    return meError(error);
  }
}
