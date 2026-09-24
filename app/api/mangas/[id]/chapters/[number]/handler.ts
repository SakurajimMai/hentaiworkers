import { NextResponse } from 'next/server';
import type { MangaReaderData } from '@/lib/manga-service';

export type MangaReaderDataLoader = (
  identifier: string,
  chapterNumber: number,
) => Promise<MangaReaderData | null>;

export type MangaChapterHandlerDependencies = {
  isMangaEnabled: () => Promise<boolean>;
  loadReaderData: MangaReaderDataLoader;
  /** Admin 阅读页直连图床. Tells the app to load stored URLs as-is, without /cdn-img or prefetch. */
  loadReaderConfig: () => Promise<Readonly<{ directImages: boolean }>>;
  recordView: (mangaId: number) => Promise<void>;
  scheduleAfter: (task: Promise<unknown>) => void;
};

export function createMangaChapterHandler(dependencies: MangaChapterHandlerDependencies) {
  function scheduleViewTask(mangaId: number): void {
    try {
      const task = dependencies.recordView(mangaId);
      dependencies.scheduleAfter(task);
    } catch (error) {
      console.error('[api/mangas/chapters] failed to schedule manga view', error);
    }
  }

  return async function mangaChapterHandler(
    _request: Request,
    { params }: { params: Promise<{ id: string; number: string }> },
  ) {
    try {
      if (!(await dependencies.isMangaEnabled())) {
        return NextResponse.json({ error: 'Manga disabled' }, { status: 404 });
      }

      const { id, number: numberRaw } = await params;
      const number = parseInt(numberRaw, 10);
      if (!Number.isFinite(number) || number < 1) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const readerData = await dependencies.loadReaderData(id, number);
      if (!readerData) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      scheduleViewTask(readerData.manga.id);
      // A setting that cannot be read must not cost the reader its chapter: fall back to the
      // proxied pipeline every app build understands.
      const readerConfig = await dependencies.loadReaderConfig().catch(() => ({ directImages: false }));
      return NextResponse.json({
        manga: {
          id: readerData.manga.id,
          title: readerData.manga.title,
          coverUrl: readerData.manga.coverUrl,
        },
        chapter: readerData.chapter,
        directImages: readerConfig.directImages,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed' },
        { status: 500 },
      );
    }
  };
}
