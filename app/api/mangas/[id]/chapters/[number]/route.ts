import { after } from 'next/server';
import { getMangaReaderConfig, getMangaReaderData, isMangaEnabled } from '@/lib/manga-client';
import { recordMangaView } from '@/lib/manga-views';
import { createMangaChapterHandler } from './handler';

export const dynamic = 'force-dynamic';

export const GET = createMangaChapterHandler({
  isMangaEnabled,
  loadReaderData: getMangaReaderData,
  loadReaderConfig: getMangaReaderConfig,
  recordView: recordMangaView,
  scheduleAfter: after,
});
