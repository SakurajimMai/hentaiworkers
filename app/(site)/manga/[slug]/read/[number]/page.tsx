import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getChapter, getManga, isMangaEnabled } from '@/lib/manga-client';
import { MangaReader } from '@/components/manga-reader';
import { recordMangaView } from '@/lib/manga-views';
import { getIdentityService } from '@/lib/server/identity';
import { isMangaFavorite } from '@/lib/server/manga-favorites';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string; number: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug, number } = await params;
  const manga = await getManga(slug);
  return {
    title: manga ? `${manga.title} · P${number}` : '漫画阅读',
    alternates: manga ? { canonical: `/manga/${manga.id}/read/${number}` } : undefined,
    robots: { index: false, follow: true },
  };
}

export default async function MangaReadPage({ params }: { params: Params }) {
  const { slug, number: numberRaw } = await params;
  const number = parseInt(numberRaw, 10);
  if (!Number.isFinite(number) || number < 1) notFound();
  if (!(await isMangaEnabled())) notFound();

  const [manga, chapter] = await Promise.all([getManga(slug), getChapter(slug, number)]);
  if (!manga || !chapter) notFound();
  if (slug !== String(manga.id)) permanentRedirect(`/manga/${manga.id}/read/${number}`);

  const user = await getIdentityService().getCurrentUser();
  const [favorited] = await Promise.all([
    user ? isMangaFavorite(manga.id) : Promise.resolve(false),
    recordMangaView(manga.id),
  ]);

  return (
    <MangaReader
      title={manga.title}
      mangaId={manga.id}
      chapterNumber={number}
      pages={chapter.pages}
      pageCount={chapter.pageCount}
      favorited={favorited}
    />
  );
}
