import { NextResponse } from 'next/server';
import { getChapter, getManga, isMangaEnabled } from '@/lib/manga-client';
import { recordMangaView } from '@/lib/manga-views';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; number: string }> },
) {
  try {
    if (!(await isMangaEnabled())) {
      return NextResponse.json({ error: 'Manga disabled' }, { status: 404 });
    }
    const { id, number: numberRaw } = await params;
    const number = parseInt(numberRaw, 10);
    if (!Number.isFinite(number) || number < 1) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const [manga, chapter] = await Promise.all([getManga(id), getChapter(id, number)]);
    if (!manga || !chapter) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    void recordMangaView(manga.id);
    return NextResponse.json({
      manga: {
        id: manga.id,
        title: manga.title,
        coverUrl: manga.coverUrl,
      },
      chapter,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
