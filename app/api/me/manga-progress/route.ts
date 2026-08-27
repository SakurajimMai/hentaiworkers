import { NextRequest } from 'next/server';
import {
  deleteAllMangaProgress,
  listMangaProgress,
  mergeGuestMangaProgress,
} from '@/lib/server/manga-progress';
import { meError, meJson } from '../http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);
    const data = await listMangaProgress(Number.isFinite(limit) ? limit : 50);
    return meJson({ data });
  } catch (error) {
    return meError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      rows?: Array<{
        mangaId: number;
        chapterNumber: number;
        pageIndex?: number;
        lastReadAt?: string;
      }>;
    };
    const result = await mergeGuestMangaProgress(body.rows ?? []);
    return meJson(result);
  } catch (error) {
    return meError(error);
  }
}

export async function DELETE() {
  try {
    await deleteAllMangaProgress();
    return meJson({ ok: true });
  } catch (error) {
    return meError(error);
  }
}
