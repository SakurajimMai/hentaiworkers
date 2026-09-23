'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { IconChevronLeft, IconChevronRight, IconPlay, IconSparkles } from '@/components/icons';
import { MediaImage } from '@/components/media-image';

export type HeroItem = {
  id: number | string;
  title: string;
  titleJapanese?: string | null;
  description?: string | null;
  cover?: string | null;
  fanart?: string | null;
  /** Admin-provided cover; overrides fanart/cover when set. */
  imageUrl?: string | null;
  /** Slide target; defaults to /watch/{id}. */
  href?: string;
  ctaLabel?: string;
};

export function HeroCarousel({
  items,
  intervalSeconds = 7,
}: {
  items: HeroItem[];
  intervalSeconds?: number;
}) {
  const [active, setActive] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const intervalMs = Math.max(2, Math.min(60, intervalSeconds)) * 1000;

  useEffect(() => {
    if (items.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % items.length), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, items.length]);

  if (!items.length) return null;

  const go = (next: number) => {
    const total = items.length;
    setActive(((next % total) + total) % total);
  };

  const backdrop = (a: HeroItem) => {
    if (a.imageUrl) return a.imageUrl;
    if (a.fanart) {
      const first = a.fanart.split(',')[0]?.trim();
      if (first) return first;
    }
    return a.cover || '';
  };

  const shouldLoad = (idx: number) => idx === active || idx === (active + 1) % items.length;

  const excerpt = (raw: string | null | undefined) => {
    const text = String(raw || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';
    if (text.length <= 72) return text;
    return `${text.slice(0, 72).replace(/[、。，,\s]+$/u, '')}…`;
  };

  return (
    <div
      className="hero-carousel relative w-full overflow-hidden rounded-2xl border border-border bg-ink shadow-ink sm:rounded-3xl"
      role="region"
      aria-roledescription="carousel"
      aria-label="精选作品"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          go(active - 1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          go(active + 1);
        }
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current == null) return;
        const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) < 40) return;
        go(active + (delta < 0 ? 1 : -1));
      }}
    >
      {items.map((anime, idx) => {
        const isActive = idx === active;
        const src = backdrop(anime);
        const summary = excerpt(anime.description);
        return (
          <div
            key={anime.id}
            className={`absolute inset-0 transition-opacity duration-700 ${
              isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-hidden={!isActive}
          >
            {shouldLoad(idx) && (
              <div className="absolute inset-0">
                <MediaImage
                  src={src || null}
                  alt={anime.title}
                  width={1280}
                  height={720}
                  loading={idx === 0 ? 'eager' : 'lazy'}
                  fetchPriority={idx === 0 ? 'high' : 'auto'}
                  className="absolute inset-0 h-full w-full object-cover saturate-[0.88]"
                  variant="wide"
                  fallbackLabel="暂无海报"
                />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-ink/20 sm:bg-gradient-to-r sm:from-ink/85 sm:via-ink/48 sm:to-transparent" />
            <div className="relative z-10 flex h-full min-h-0 items-end">
              <div className="w-full max-w-lg min-w-0 overflow-hidden px-4 pb-9 sm:px-10 sm:pb-14">
                <div className="mb-2.5 hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-meta text-[11px] normal-case tracking-normal text-white/90 backdrop-blur-md border border-white/10">
                  <IconSparkles size={12} className="text-accent" />
                  <span>精选推荐</span>
                </div>
                <h2 className="font-serif text-[1.25rem] leading-tight tracking-tight text-white line-clamp-2 text-balance sm:text-4xl drop-shadow-sm">
                  {anime.title}
                </h2>
                {anime.titleJapanese && (
                  <p className="mt-2 hidden font-ui text-[12px] text-white/65 line-clamp-1 sm:block">
                    {anime.titleJapanese}
                  </p>
                )}
                {summary && (
                  <p className="mt-2.5 hidden max-w-[44ch] font-ui text-[13px] leading-relaxed text-white/80 line-clamp-2 sm:block">
                    {summary}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-2 sm:pt-3">
                  {(() => {
                    const href = anime.href || `/watch/${anime.id}`;
                    const label = anime.ctaLabel || '立即播放';
                    const cls =
                      'btn-ink !bg-white !text-[#1a1917] hover:!bg-white/95 !px-3.5 !py-2 !text-[12px] sm:!px-4 sm:!py-2.5 sm:!text-[13px] shadow-lg hover:shadow-xl active:scale-[0.98] transition-all duration-200 font-semibold';
                    const inner = (
                      <>
                        <IconPlay size={14} className="fill-current text-[#1a1917]" />
                        {label}
                      </>
                    );
                    return /^https?:\/\//.test(href) ? (
                      <a href={href} className={cls} rel="noopener">
                        {inner}
                      </a>
                    ) : (
                      <Link href={href} className={cls}>
                        {inner}
                      </Link>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {items.length > 1 && (
        <>
          <button
            type="button"
            aria-label="上一张"
            onClick={() => go(active - 1)}
            className="absolute left-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-ink/50 text-white backdrop-blur-md transition-all hover:bg-ink/75 hover:scale-105 active:scale-95 sm:grid cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50"
          >
            <IconChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={() => go(active + 1)}
            className="absolute right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-ink/50 text-white backdrop-blur-md transition-all hover:bg-ink/75 hover:scale-105 active:scale-95 sm:grid cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50"
          >
            <IconChevronRight size={18} />
          </button>
          <div className="absolute bottom-2 left-1/2 z-20 flex w-max max-w-[calc(100%-1rem)] flex-wrap -translate-x-1/2 items-center justify-center rounded-full bg-ink/40 px-1 backdrop-blur-sm sm:bottom-5 sm:left-auto sm:right-5 sm:translate-x-0">
            {items.map((item, idx) => (
              // The dot stays 8px; the button around it carries the 24px target the pointer needs.
              <button
                key={item.id}
                type="button"
                aria-label={`显示：${item.title}`}
                aria-current={idx === active ? 'true' : undefined}
                onClick={() => go(idx)}
                className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <span
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === active ? 'w-5 bg-white' : 'w-2 bg-white/40'
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
