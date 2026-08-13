'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimeCard } from '@/components/AnimeCard';
import { FavoriteHeart } from '@/components/favorite-toggle';
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

export function FavoritesLibrary({
  animes,
  mangas,
}: {
  animes: readonly FavoriteAnimeItem[];
  mangas: readonly FavoriteMangaItem[];
}) {
  const [animeIds, setAnimeIds] = useState(animes.map((item) => item.id));
  const [mangaIds, setMangaIds] = useState(mangas.map((item) => item.id));
  const animeMap = new Map(animes.map((item) => [item.id, item]));
  const mangaMap = new Map(mangas.map((item) => [item.id, item]));
  const visibleAnimes = animeIds.map((id) => animeMap.get(id)).filter(Boolean) as FavoriteAnimeItem[];
  const visibleMangas = mangaIds.map((id) => mangaMap.get(id)).filter(Boolean) as FavoriteMangaItem[];
  const empty = visibleAnimes.length === 0 && visibleMangas.length === 0;

  return (
    <div className="space-y-10">
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

      {visibleAnimes.length > 0 && (
        <section className="space-y-5">
          <h2 className="section-title text-2xl text-ink">里番</h2>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-10 md:grid-cols-4 lg:grid-cols-5">
            {visibleAnimes.map((anime) => (
              <li key={anime.id} className="relative">
                <AnimeCard anime={anime} />
                <div className="absolute right-2 top-2 z-20">
                  <FavoriteHeart
                    kind="anime"
                    id={anime.id}
                    favorited
                    returnTo="/favorites"
                    onRemoved={() => setAnimeIds((ids) => ids.filter((id) => id !== anime.id))}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {visibleMangas.length > 0 && (
        <section className="space-y-5">
          <h2 className="section-title text-2xl text-ink">漫画</h2>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-10 md:grid-cols-4 lg:grid-cols-5">
            {visibleMangas.map((manga) => (
              <li key={manga.id} className="relative">
                <MangaCard manga={manga} />
                <div className="absolute right-2 top-2 z-20">
                  <FavoriteHeart
                    kind="manga"
                    id={manga.id}
                    favorited
                    returnTo="/favorites"
                    onRemoved={() => setMangaIds((ids) => ids.filter((id) => id !== manga.id))}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
