import { redirect } from 'next/navigation';
import { FavoritesLibrary } from '@/components/favorites-library';
import { getFavoritesService, getIdentityService } from '@/lib/server/identity';
import { listMangaFavorites } from '@/lib/server/manga-favorites';

import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '收藏',
  ...noIndexMetadata,
};

export default async function FavoritesPage() {
  const user = await getIdentityService().getCurrentUser();
  if (!user) {
    redirect('/login?next=/favorites');
  }

  const [animes, mangas] = await Promise.all([
    getFavoritesService().listMine().catch(() => []),
    listMangaFavorites().catch(() => []),
  ]);

  return (
    <div className="page-shell py-8 sm:py-12 pb-20 space-y-8">
      <header className="border-b border-border pb-7">
        <h1 className="section-title text-3xl text-ink sm:text-4xl">收藏</h1>
      </header>
      <FavoritesLibrary
        animes={animes.map((item) => ({
          id: item.id,
          title: item.title,
          cover: item.cover,
        }))}
        mangas={mangas.map((item) => ({
          id: item.mangaId,
          title: item.title,
          coverUrl: item.coverUrl,
          pageCount: item.pageCount,
        }))}
      />
    </div>
  );
}
