import { cache } from 'react';
import type { Metadata } from 'next';
import { after } from 'next/server';
import { notFound, permanentRedirect } from 'next/navigation';
import {
  MangaReader,
  type MangaReaderAds,
  type MangaReaderFavoriteState,
  type MangaReaderSessionState,
} from '@/components/manga-reader';
import { getMangaReaderData, isMangaEnabled } from '@/lib/manga-client';
import { recordMangaView } from '@/lib/manga-views';
import { getIdentityService } from '@/lib/server/identity';
import { isMangaFavorite } from '@/lib/server/manga-favorites';
import { getSystemSettingsService } from '@/lib/server/system';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string; number: string }>;

const getCachedReaderData = cache((slug: string, chapterNumber: number) => (
  getMangaReaderData(slug, chapterNumber)
));

async function readReaderSession(): Promise<MangaReaderSessionState> {
  try {
    const user = await getIdentityService().getCurrentUser();
    return { available: true, authenticated: Boolean(user) };
  } catch (error) {
    console.error('readReaderSession failed', error);
    return { available: false, authenticated: false };
  }
}

async function readReaderFavorite(
  mangaId: number,
  session: Promise<MangaReaderSessionState>,
): Promise<MangaReaderFavoriteState> {
  const state = await session;
  if (!state.available) return { available: false, favorited: false };
  if (!state.authenticated) return { available: true, favorited: false };
  try {
    return { available: true, favorited: await isMangaFavorite(mangaId) };
  } catch (error) {
    console.error('readReaderFavorite failed', error);
    return { available: false, favorited: false };
  }
}

async function readReaderAds(): Promise<MangaReaderAds> {
  try {
    const ads = await getSystemSettingsService().getPublicAdsConfig();
    return {
      topHtml: ads.reader.top.enabled ? ads.reader.top.html : '',
      bottomHtml: ads.reader.bottom.enabled ? ads.reader.bottom.html : '',
    };
  } catch (error) {
    console.error('readReaderAds failed', error);
    return { topHtml: '', bottomHtml: '' };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug, number: numberRaw } = await params;
  const number = parseInt(numberRaw, 10);
  const readerData = Number.isFinite(number) && number >= 1
    ? await getCachedReaderData(slug, number)
    : null;
  return {
    title: readerData ? `${readerData.manga.title} · P${number}` : '漫画阅读',
    alternates: readerData
      ? { canonical: `/manga/${readerData.manga.id}/read/${number}` }
      : undefined,
    robots: { index: false, follow: true },
  };
}

export default async function MangaReadPage({ params }: { params: Params }) {
  const { slug, number: numberRaw } = await params;
  const number = parseInt(numberRaw, 10);
  if (!Number.isFinite(number) || number < 1) notFound();

  const [enabled, readerData] = await Promise.all([
    isMangaEnabled(),
    getCachedReaderData(slug, number),
  ]);
  if (!enabled || !readerData) notFound();
  if (slug !== String(readerData.manga.id)) {
    permanentRedirect(`/manga/${readerData.manga.id}/read/${number}`);
  }

  const session = readReaderSession();
  const favorite = readReaderFavorite(readerData.manga.id, session);
  const readerAds = readReaderAds();
  after(recordMangaView(readerData.manga.id));

  return (
    <MangaReader
      key={`${readerData.manga.id}:${number}`}
      title={readerData.manga.title}
      mangaId={readerData.manga.id}
      chapterNumber={number}
      pages={readerData.chapter.pages}
      pageCount={readerData.chapter.pageCount}
      session={session}
      favorite={favorite}
      readerAds={readerAds}
    />
  );
}
