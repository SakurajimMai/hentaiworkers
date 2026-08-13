import { NextResponse } from 'next/server';
import { getManga, isMangaEnabled } from '@/lib/manga-client';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await isMangaEnabled())) {
      return NextResponse.json({ error: 'Manga disabled' }, { status: 404 });
    }
    const { id } = await params;
    const manga = await getManga(id);
    if (!manga) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(manga);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
