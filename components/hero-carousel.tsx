'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IconPlay } from '@/components/icons';

export type HeroItem = {
  id: number;
  title: string;
  titleJapanese?: string | null;
  description?: string | null;
  cover?: string | null;
  fanart?: string | null;
};

export function HeroCarousel({ items }: { items: HeroItem[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const id = setInterval(() => setActive((i) => (i + 1) % items.length), 7000);
    return () => clearInterval(id);
  }, [paused, items.length]);

  if (!items.length) return null;

  const backdrop = (a: HeroItem) => {
    if (a.fanart) {
      const first = a.fanart.split(',')[0]?.trim();
      if (first) return first;
    }
    return a.cover || '';
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-[#EAEAEA] bg-white"
      style={{ height: 'clamp(320px, 46vh, 460px)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {items.map((anime, idx) => {
        const isActive = idx === active;
        const src = backdrop(anime);
        return (
          <div
            key={anime.id}
            className={`absolute inset-0 transition-opacity duration-700 ${
              isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                aria-hidden
                className={`absolute inset-0 h-full w-full object-cover saturate-[0.85] ${
                  isActive ? 'scale-[1.03]' : 'scale-100'
                }`}
                style={{ transition: 'transform 8s ease-out' }}
                referrerPolicy="no-referrer"
              />
            )}
            <div className="absolute inset-0 bg-[#111]/55" />
            <div className="relative z-10 flex h-full items-end sm:items-center">
              <div className="w-full max-w-lg space-y-3 px-5 pb-12 sm:px-9 sm:pb-0">
                <p className="font-meta text-white/70">Featured</p>
                <h1 className="font-serif text-[1.75rem] sm:text-4xl text-white">{anime.title}</h1>
                {anime.description && (
                  <p className="font-ui text-[13px] leading-relaxed text-white/70 line-clamp-2 sm:line-clamp-3">
                    {anime.description.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()}
                  </p>
                )}
                <div className="flex gap-2 pt-2">
                  <Link href={`/watch/${anime.id}`} className="btn-ink bg-white text-[#111] hover:bg-white/90">
                    <IconPlay size={13} />
                    播放
                  </Link>
                  <Link
                    href={`/watch/${anime.id}`}
                    className="btn-ghost border-white/25 text-white hover:bg-white/10"
                  >
                    详情
                  </Link>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {items.length > 1 && (
        <div className="absolute bottom-5 right-5 z-20 flex gap-1.5">
          {items.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`第 ${idx + 1} 部`}
              onClick={() => setActive(idx)}
              className={`h-1 rounded-sm transition-all ${
                idx === active ? 'w-5 bg-white' : 'w-1.5 bg-white/35'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
