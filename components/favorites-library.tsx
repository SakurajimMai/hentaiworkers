import Link from 'next/link';
import { AnimeCard } from '@/components/AnimeCard';
import { FavoriteHeart } from '@/components/favorite-toggle';
import { LibraryPagination } from '@/components/library-pagination';
import { MangaCard } from '@/components/MangaCard';

export type FavoriteAnimeItem = {
  id: number;
  title: string;
  cover: string | null;
};

export type FavoriteMangaItem = {
  id: number;
  title: string;
  coverUrl: string | null;
  pageCount: number;
};

type FavoritePageMeta = Readonly<{
  page: number;
  total: number;
  totalPages: number;
}>;

export function FavoritesLibrary({
  animes,
  mangas,
  animePage,
  mangaPage,
  returnTo,
}: {
  animes: readonly FavoriteAnimeItem[];
  mangas: readonly FavoriteMangaItem[];
  animePage: FavoritePageMeta;
  mangaPage: FavoritePageMeta;
  returnTo: string;
}) {
  const empty = animePage.total === 0 && mangaPage.total === 0;
  const query = {
    animePage: animePage.page > 1 ? String(animePage.page) : undefined,
    mangaPage: mangaPage.page > 1 ? String(mangaPage.page) : undefined,
  };

  return (
    <div className="space-y-12">
      {empty && (
        <div className="empty-state space-y-4">
          <p className="font-meta">Empty</p>
          <p className="section-title text-2xl text-ink">还没有收藏</p>
          <p className="font-ui text-sm text-soft">在作品页点爱心即可加入这里。</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/browse" className="btn-ink inline-flex">浏览里番</Link>
            <Link href="/manga" className="btn-ghost inline-flex">浏览漫画</Link>
          </div>
        </div>
      )}

      {animePage.total > 0 && (
        <section className="space-y-6" aria-labelledby="favorite-animes-heading">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
            <h2 id="favorite-animes-heading" className="section-title text-2xl text-ink">里番</h2>
            <p className="font-meta text-[11px] normal-case tracking-normal text-soft">
              共 <span className="tabular">{animePage.total}</span> 部
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-10 md:grid-cols-4 lg:grid-cols-5">
            {animes.map((anime) => (
              <li key={anime.id} className="relative">
                <AnimeCard anime={anime} />
                <div className="absolute right-2 top-2 z-20">
                  <FavoriteHeart
                    kind="anime"
                    id={anime.id}
                    favorited
                    returnTo={returnTo}
                  />
                </div>
              </li>
            ))}
          </ul>
          <LibraryPagination
            page={animePage.page}
            totalPages={animePage.totalPages}
            total={animePage.total}
            basePath="/favorites"
            query={query}
            pageParam="animePage"
            ariaLabel="里番收藏分页"
          />
        </section>
      )}

      {mangaPage.total > 0 && (
        <section className="space-y-6" aria-labelledby="favorite-mangas-heading">
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
            <h2 id="favorite-mangas-heading" className="section-title text-2xl text-ink">漫画</h2>
            <p className="font-meta text-[11px] normal-case tracking-normal text-soft">
              共 <span className="tabular">{mangaPage.total}</span> 部
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-10 md:grid-cols-4 lg:grid-cols-5">
            {mangas.map((manga) => (
              <li key={manga.id} className="relative">
                <MangaCard manga={manga} />
                <div className="absolute right-2 top-2 z-20">
                  <FavoriteHeart
                    kind="manga"
                    id={manga.id}
                    favorited
                    returnTo={returnTo}
                  />
                </div>
              </li>
            ))}
          </ul>
          <LibraryPagination
            page={mangaPage.page}
            totalPages={mangaPage.totalPages}
            total={mangaPage.total}
            basePath="/favorites"
            query={query}
            pageParam="mangaPage"
            ariaLabel="漫画收藏分页"
          />
        </section>
      )}
    </div>
  );
}
