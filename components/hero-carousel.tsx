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
      className="relative w-full overflow-hidden rounded-3xl border border-[#e8e4dc] bg-[#1a1917] shadow-ink"
      style={{ minHeight: 'clamp(320px, 46dvh, 460px)', height: 'clamp(320px, 46dvh, 460px)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="精选作品"
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
            aria-hidden={!isActive}
          >
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                aria-hidden
                className={`absolute inset-0 h-full w-full object-cover saturate-[0.88] ${
                  isActive ? 'scale-[1.04]' : 'scale-100'
                }`}
                style={{ transition: 'transform 8s ease-out' }}
                referrerPolicy="no-referrer"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#1a1917]/85 via-[#1a1917]/48 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1917]/55 via-transparent to-[#1a1917]/15" />
            <div className="relative z-10 flex h-full items-end sm:items-center">
              <div className="w-full max-w-lg space-y-3 px-5 pb-16 sm:px-9 sm:pb-0 sm:pt-2">
                <p className="font-meta text-white/60">精选</p>
                <h2 className="font-serif text-[1.75rem] sm:text-4xl text-white tracking-tight text-balance">
                  {anime.title}
                </h2>
                {anime.titleJapanese && (
                  <p className="font-ui text-[12px] text-white/55 line-clamp-1">
                    {anime.titleJapanese}
                  </p>
                )}
                {anime.description && (
                  <p className="font-ui text-[13px] leading-relaxed text-white/70 line-clamp-2 sm:line-clamp-3 max-w-[42ch]">
                    {anime.description.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link
                    href={`/watch/${anime.id}`}
                    className="btn-ink !bg-white !text-[#1a1917] hover:!bg-white/90"
                  >
                    <IconPlay size={13} />
                    播放
                  </Link>
                  <Link
                    href={`/watch/${anime.id}`}
                    className="btn-ghost !border-white/20 !text-white hover:!bg-white/10"
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
        <div className="absolute bottom-5 right-5 z-20 flex gap-1.5 rounded-full bg-[#1a1917]/35 p-1.5 backdrop-blur-sm">
          {items.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              aria-label={`显示：${item.title}`}
              aria-current={idx === active ? 'true' : undefined}
              onClick={() => setActive(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === active ? 'w-5 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
