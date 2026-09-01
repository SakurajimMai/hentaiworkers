'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';
import {
  getCarouselPageTarget,
  type CarouselDirection,
} from '@/components/horizontal-carousel-model';

export function HorizontalCarousel({
  title,
  meta,
  viewAllHref,
  children,
}: {
  title: string;
  meta?: string;
  viewAllHref?: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const trackId = useId();
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanL(el.scrollLeft > 4);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resizeObserver?.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      resizeObserver?.disconnect();
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const scrollPage = (direction: CarouselDirection) => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = Number.parseFloat(window.getComputedStyle(el).columnGap) || 0;
    el.scrollTo({
      left: getCarouselPageTarget(
        {
          scrollLeft: el.scrollLeft,
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          gap,
        },
        direction,
      ),
      behavior: 'smooth',
    });
  };

  return (
    <section className="min-w-0" aria-labelledby={titleId}>
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-3.5">
        <div className="min-w-0">
          {meta && <p className="font-meta mb-1">{meta}</p>}
          <h2 id={titleId} className="section-title text-xl sm:text-2xl text-ink">
            {title}
          </h2>
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="shrink-0 rounded-full px-3 py-1.5 font-ui text-[13px] text-soft hover:bg-card hover:text-ink transition-colors duration-200"
          >
            查看全部
          </Link>
        )}
      </div>
      <div className="relative">
        <button
          type="button"
          aria-label="向左滚动"
          aria-controls={trackId}
          disabled={!canL}
          onClick={() => scrollPage('left')}
          className="absolute left-0 top-1/2 z-10 hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/95 text-ink shadow-whisper backdrop-blur-sm transition hover:bg-secondary active:scale-[0.98] disabled:pointer-events-none disabled:opacity-0 md:flex"
        >
          <IconChevronLeft size={16} />
        </button>
        <button
          type="button"
          aria-label="向右滚动"
          aria-controls={trackId}
          disabled={!canR}
          onClick={() => scrollPage('right')}
          className="absolute right-0 top-1/2 z-10 hidden h-11 w-11 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/95 text-ink shadow-whisper backdrop-blur-sm transition hover:bg-secondary active:scale-[0.98] disabled:pointer-events-none disabled:opacity-0 md:flex"
        >
          <IconChevronRight size={16} />
        </button>
        <div
          id={trackId}
          ref={scrollRef}
          className="flex w-full gap-3 overflow-x-auto overscroll-x-contain scrollbar-hide snap-x snap-mandatory scroll-smooth motion-reduce:scroll-auto pb-1 sm:gap-4"
          role="group"
          aria-roledescription="carousel"
          aria-label={`${title}横向列表`}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
