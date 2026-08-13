import { NextRequest, NextResponse } from 'next/server';
import { isMangaEnabled, listMangas } from '@/lib/manga-client';
import { isMangaRank } from '@/lib/manga-views';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!(await isMangaEnabled())) {
      return NextResponse.json({ error: 'Manga disabled' }, { status: 404 });
    }
    const sp = req.nextUrl.searchParams;
    const page = parseInt(sp.get('page') || '1', 10);
    const limit = parseInt(sp.get('limit') || '24', 10);
    const q = sp.get('q') || undefined;
    const tag = sp.get('tag') || undefined;
    const rankRaw = sp.get('rank') || undefined;
    const result = await listMangas({
      page,
      limit,
      q,
      tag,
      rank: isMangaRank(rankRaw) ? rankRaw : undefined,
    });
    return NextResponse.json({
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
