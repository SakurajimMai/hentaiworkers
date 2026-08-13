'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconArrowLeft, IconArrowUp, IconMaximize } from '@/components/icons';
import { MangaFavoriteButton } from '@/components/manga-favorite-button';
import { MediaImage } from '@/components/media-image';
import { ThemeMenu } from '@/components/theme-menu';

type ReaderPage = {
  index: number;
  imageUrl: string;
};

type MangaReaderProps = {
  title: string;
  mangaId: number;
  chapterNumber: number;
  pages: ReaderPage[];
  pageCount: number;
  favorited?: boolean;
};

export function MangaReader({
  title,
  mangaId,
  chapterNumber,
  pages,
  pageCount,
  favorited = false,
}: MangaReaderProps) {
  const [activePage, setActivePage] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(() => new Set([0, 1]));
  const pageRefs = useRef<(HTMLElement | null)[]>([]);
  const lastScrollY = useRef(0);
  const readerKey = useMemo(
    () => `manga-progress:${mangaId}:${chapterNumber}`,
    [chapterNumber, mangaId],
  );
  const totalPages = pageCount || pages.length;

  const loadAround = useCallback((indexes: number[]) => {
    setLoadedPages((current) => {
      const next = new Set(current);
      indexes.forEach((index) => {
        [index - 1, index, index + 1].forEach((candidate) => {
          if (candidate >= 0 && candidate < pages.length) next.add(candidate);
        });
      });
      return next.size === current.size ? current : next;
    });
  }, [pages.length]);

  useEffect(() => {
    const nodes = pageRefs.current.filter(Boolean) as HTMLElement[];
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const nearby: number[] = [];
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = Number((visible.target as HTMLElement).dataset.pageIndex);
        if (!Number.isNaN(index)) {
          nearby.push(index);
          setActivePage(index);
          window.localStorage.setItem(readerKey, String(index));
        }
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const entryIndex = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (!Number.isNaN(entryIndex)) nearby.push(entryIndex);
        });
        if (nearby.length) loadAround(nearby);
      },
      { rootMargin: '1400px 0px 1400px', threshold: [0.01, 0.15, 0.5, 0.85] },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [loadAround, pages.length, readerKey]);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(readerKey));
    if (!Number.isInteger(saved) || saved < 1 || saved >= pages.length) return;
    loadAround([saved]);
    const target = pageRefs.current[saved];
    window.setTimeout(() => target?.scrollIntoView({ block: 'start' }), 80);
  }, [loadAround, readerKey, pages.length]);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onScroll = () => {
      const y = window.scrollY;
      setShowTop(y > 480);
      if (!reduceMotion.matches) {
        setChromeHidden(y > lastScrollY.current && y > 96);
      }
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void document.documentElement.requestFullscreen?.();
  };

  const progress = totalPages ? Math.round(((activePage + 1) / totalPages) * 100) : 0;

  return (
    <div data-reader-shell className="reader-shell min-h-dvh">
      <header className={`reader-header ${chromeHidden ? 'is-hidden' : ''}`}>
        <div className="mx-auto flex min-h-14 max-w-5xl items-center gap-2 px-3 sm:px-5">
          <Link
            href={`/manga/${mangaId}`}
            className="reader-icon-button"
            aria-label="返回作品"
            title="返回作品"
          >
            <IconArrowLeft size={17} />
          </Link>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate font-ui text-[13px] font-medium text-ink">{title}</p>
            <p className="font-meta text-[10px] tabular" aria-live="polite">
              P{activePage + 1} / P{totalPages || '—'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <MangaFavoriteButton
              mangaId={mangaId}
              favorited={favorited}
              returnTo={`/manga/${mangaId}/read/${chapterNumber}`}
              compact
            />
            <button
              type="button"
              className="reader-icon-button"
              aria-label={isFullscreen ? '退出全屏' : '全屏阅读'}
              title={isFullscreen ? '退出全屏' : '全屏阅读'}
              onClick={toggleFullscreen}
            >
              <IconMaximize size={15} />
            </button>
            <ThemeMenu compact />
          </div>
        </div>
        <div className="reader-progress" aria-hidden="true">
          <div className="reader-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="reader-canvas mx-auto w-full">
        {pages.length === 0 ? (
          <div className="px-5 py-24 text-center">
            <p className="font-ui text-sm text-soft">这部作品还没有可阅读内容。</p>
            <Link href={`/manga/${mangaId}`} className="mt-5 inline-flex btn-ghost">
              返回作品
            </Link>
          </div>
        ) : (
          <div className="reader-stage">
            {pages.map((page) => (
              <figure
                key={page.index}
                ref={(element) => {
                  pageRefs.current[page.index] = element;
                }}
                data-page-index={page.index}
                className="reader-page"
              >
                {loadedPages.has(page.index) ? (
                  <MediaImage
                    src={page.imageUrl}
                    alt={`${title} P${page.index + 1}`}
                    width={900}
                    height={1280}
                    className="reader-image"
                    loading={page.index < 2 ? 'eager' : 'lazy'}
                    variant="page"
                    fallbackLabel="本页加载失败"
                  />
                ) : (
                  <div
                    className="reader-image reader-image-pending"
                    aria-hidden="true"
                    aria-busy="true"
                  />
                )}
              </figure>
            ))}
          </div>
        )}
      </main>

      {showTop && (
        <button
          type="button"
          className="reader-icon-button reader-to-top fixed bottom-5 right-5 z-40"
          aria-label="回到顶部"
          title="回到顶部"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <IconArrowUp size={17} />
        </button>
      )}
    </div>
  );
}
