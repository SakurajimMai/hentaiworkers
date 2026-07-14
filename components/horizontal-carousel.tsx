'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';

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
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(true);

  const update = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanL(el.scrollLeft > 4);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const scrollBy = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth * 0.75 : el.clientWidth * 0.75, behavior: 'smooth' });
  };

  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-[#EAEAEA] pb-3">
        <div>
          {meta && <p className="font-meta mb-1">{meta}</p>}
          <h2 className="font-serif text-xl sm:text-2xl text-[#111]">{title}</h2>
        </div>
        {viewAllHref && (
          <Link href={viewAllHref} className="font-ui text-[13px] text-[#787774] hover:text-[#111]">
            查看全部
          </Link>
        )}
      </div>
      <div className="relative">
        {canL && (
          <button
            type="button"
            aria-label="向左"
            onClick={() => scrollBy('left')}
            className="hidden md:flex absolute left-0 top-1/2 z-10 h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-[#EAEAEA] bg-white"
          >
            <IconChevronLeft size={16} />
          </button>
        )}
        {canR && (
          <button
            type="button"
            aria-label="向右"
            onClick={() => scrollBy('right')}
            className="hidden md:flex absolute right-0 top-1/2 z-10 h-9 w-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-[#EAEAEA] bg-white"
          >
            <IconChevronRight size={16} />
          </button>
        )}
        <div
          ref={scrollRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-smooth pb-1"
        >
          {children}
        </div>
      </div>
    </section>
  );
}
