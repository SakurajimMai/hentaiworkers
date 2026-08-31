import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { FavoritesLibrary } from '@/components/favorites-library';
import type { PaginationQuery } from '@/components/pagination-model';
import { getFavoritesService, getIdentityService } from '@/lib/server/identity';
import { listMangaFavoritesPage } from '@/lib/server/manga-favorites';
import { buildPublicLoginHref } from '@/lib/server/shared/auth-navigation';
import {
  isCanonicalPageParam,
  parsePageParam,
} from '@/lib/server/shared/pagination';
import { noIndexMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '收藏',
  ...noIndexMetadata,
};

function buildFavoritesHref(animePage: number, mangaPage: number): string {
  const params = new URLSearchParams();
  if (animePage > 1) params.set('animePage', String(animePage));
  if (mangaPage > 1) params.set('mangaPage', String(mangaPage));
  const query = params.toString();
  return query ? `/favorites?${query}` : '/favorites';
}

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams?: Promise<PaginationQuery>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedAnimePage = parsePageParam(sp.animePage);
  const requestedMangaPage = parsePageParam(sp.mangaPage);
  const requestedHref = buildFavoritesHref(requestedAnimePage, requestedMangaPage);
  if (
    !isCanonicalPageParam(sp.animePage, requestedAnimePage)
    || !isCanonicalPageParam(sp.mangaPage, requestedMangaPage)
  ) {
    redirect(requestedHref);
  }
  const user = await getIdentityService().getCurrentUser();
  if (!user) {
    redirect(buildPublicLoginHref(requestedHref));
  }

  let animeFavorites;
  let mangaFavorites;
  try {
    [animeFavorites, mangaFavorites] = await Promise.all([
      getFavoritesService().listMinePage(requestedAnimePage),
      listMangaFavoritesPage(requestedMangaPage),
    ]);
  } catch (error) {
    console.error('Failed to load favorites library', error);
    const retryHref = buildFavoritesHref(requestedAnimePage, requestedMangaPage);
    return (
      <div className="page-shell space-y-8 py-8 pb-20 sm:py-12">
        <header className="border-b border-border pb-7">
          <h1 className="section-title text-3xl text-ink sm:text-4xl">收藏</h1>
        </header>
        <div className="notice-error space-y-3 !text-sm">
          <p>收藏暂时加载失败，请稍后重试。</p>
          <Link href={retryHref} className="btn-ghost inline-flex !text-[13px]">
            重新加载
          </Link>
        </div>
      </div>
    );
  }

  const canonicalHref = buildFavoritesHref(animeFavorites.page, mangaFavorites.page);
  if (
    !isCanonicalPageParam(sp.animePage, animeFavorites.page)
    || !isCanonicalPageParam(sp.mangaPage, mangaFavorites.page)
  ) {
    redirect(canonicalHref);
  }

  return (
    <div className="page-shell space-y-8 py-8 pb-20 sm:py-12">
      <header className="border-b border-border pb-7">
        <h1 className="section-title text-3xl text-ink sm:text-4xl">收藏</h1>
        <p className="mt-2 font-ui text-sm text-soft">
          {user.displayName || user.username} · 共{' '}
          <span className="tabular">{animeFavorites.total + mangaFavorites.total}</span> 部
        </p>
      </header>
      <FavoritesLibrary
        animes={animeFavorites.items.map((item) => ({
          id: item.id,
          title: item.title,
          cover: item.cover,
        }))}
        mangas={mangaFavorites.items.map((item) => ({
          id: item.mangaId,
          title: item.title,
          coverUrl: item.coverUrl,
          pageCount: item.pageCount,
        }))}
        animePage={animeFavorites}
        mangaPage={mangaFavorites}
        returnTo={canonicalHref}
      />
    </div>
  );
}
