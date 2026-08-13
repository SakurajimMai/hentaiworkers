import Link from 'next/link';
import type { Metadata } from 'next';
import { AnimeCard } from '@/components/AnimeCard';
import { MangaCard } from '@/components/MangaCard';
import { listAnimes } from '@/lib/anime-service';
import { isMangaEnabled, listMangas } from '@/lib/manga-client';

export const revalidate = 60;

type SearchParams = Promise<{ q?: string }>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { q: raw } = await searchParams;
  const q = (raw || '').trim();
  return {
    title: q ? `搜索：${q}` : '搜索',
    description: q
      ? `在 AnimeStream 中同时搜索包含“${q}”的里番与漫画。`
      : '搜索 AnimeStream 里番与漫画。',
    alternates: { canonical: '/search' },
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q: raw } = await searchParams;
  const q = (raw || '').trim();

  if (!q) {
    return (
      <div className="page-shell py-12 sm:py-16 pb-20">
        <header className="max-w-2xl">
          <h1 className="section-title text-4xl text-ink sm:text-5xl">搜索</h1>
          <p className="mt-4 max-w-md font-ui text-[15px] leading-relaxed text-soft">
            在顶栏输入关键词，会同时查找里番和漫画。两边的标签是分开的。
          </p>
        </header>
      </div>
    );
  }

  const mangaOn = await isMangaEnabled();
  const [animesResult, mangasResult] = await Promise.allSettled([
    listAnimes({ page: 1, limit: 12, search: q }),
    mangaOn ? listMangas({ page: 1, limit: 12, q }) : Promise.resolve(null),
  ]);

  const animes = animesResult.status === 'fulfilled' ? animesResult.value : null;
  const mangas = mangasResult.status === 'fulfilled' ? mangasResult.value : null;
  const animeError = animesResult.status === 'rejected'
    ? (animesResult.reason instanceof Error ? animesResult.reason.message : '里番搜索失败')
    : null;
  const mangaError = mangasResult.status === 'rejected'
    ? (mangasResult.reason instanceof Error ? mangasResult.reason.message : '漫画搜索失败')
    : null;

  const animeCount = animes?.data.length ?? 0;
  const mangaCount = mangas?.data.length ?? 0;
  const empty = !animeError && !mangaError && animeCount === 0 && mangaCount === 0;

  return (
    <div className="page-shell py-8 sm:py-12 pb-20">
      <header className="mb-10 border-b border-border pb-7 sm:mb-12 sm:pb-9">
        <h1 className="section-title text-4xl text-ink sm:text-5xl">「{q}」</h1>
      </header>

      {empty && (
        <div className="surface-panel max-w-2xl px-6 py-12 text-center sm:px-10">
          <p className="font-meta mb-3">没有结果</p>
          <h2 className="section-title text-2xl text-ink">换个词再试试</h2>
          <p className="mx-auto mt-3 max-w-md font-ui text-[13px] leading-relaxed text-soft">
            标题、作者和各自的标签会分开匹配，里番标签不会用来找漫画。
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/browse" className="btn-ink !rounded-xl !text-[13px]">
              里番目录
            </Link>
            {mangaOn && (
              <Link href="/manga" className="btn-ghost !rounded-xl !text-[13px]">
                漫画目录
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="space-y-14 sm:space-y-16">
        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="section-title text-2xl text-ink sm:text-3xl">里番</h2>
            {animes && animes.pagination.total > animeCount && (
              <Link
                href={`/browse?search=${encodeURIComponent(q)}`}
                className="font-ui text-[12px] text-soft transition hover:text-ink"
              >
                全部里番结果
              </Link>
            )}
          </div>
          {animeError && (
            <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-4 font-ui text-sm text-destructive">
              {animeError}
            </div>
          )}
          {animes && animeCount === 0 && !animeError && (
            <p className="font-ui text-[13px] text-soft">没有匹配的里番。</p>
          )}
          {animes && animeCount > 0 && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-10 md:grid-cols-4 lg:grid-cols-6">
              {animes.data.map((anime) => (
                <AnimeCard key={anime.id} anime={anime} />
              ))}
            </div>
          )}
        </section>

        {mangaOn && (
          <section>
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 className="section-title text-2xl text-ink sm:text-3xl">漫画</h2>
              {mangas && mangas.total > mangaCount && (
                <Link
                  href={`/manga?q=${encodeURIComponent(q)}`}
                  className="font-ui text-[12px] text-soft transition hover:text-ink"
                >
                  全部漫画结果
                </Link>
              )}
            </div>
            {mangaError && (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-4 font-ui text-sm text-destructive">
                {mangaError}
              </div>
            )}
            {mangas && mangaCount === 0 && !mangaError && (
              <p className="font-ui text-[13px] text-soft">没有匹配的漫画。</p>
            )}
            {mangas && mangaCount > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-10 md:grid-cols-4 lg:grid-cols-6">
                {mangas.data.map((manga) => (
                  <MangaCard
                    key={manga.id}
                    manga={{
                      id: manga.id,
                      title: manga.title,
                      coverUrl: manga.coverUrl,
                      pageCount: manga.pageCount,
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
