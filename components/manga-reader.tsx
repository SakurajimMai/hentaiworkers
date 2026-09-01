'use client';

import Link from 'next/link';
import {
  memo,
  Suspense,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { IconArrowLeft, IconArrowUp, IconMaximize } from '@/components/icons';
import { MangaFavoriteButton } from '@/components/manga-favorite-button';
import { MediaImage } from '@/components/media-image';
import { ThemeMenu } from '@/components/theme-menu';
import { HtmlAd } from '@/components/html-ad';
import { createReaderProgressWriteQueue } from '@/components/manga-reader-progress';
import {
  getReaderAdRenderPolicy,
  getInitialReaderPages,
  getReaderImageRequestPolicy,
  getStoredReaderPage,
  isReaderViewportTransition,
  READER_PREFETCH_ROOT_MARGIN,
  READER_RESTORE_SCROLL_OPTIONS,
  selectActiveReaderPage,
  shouldSyncReaderProgress,
  type ReaderPageIntersection,
} from '@/components/manga-reader-policy';

type ReaderPage = {
  index: number;
  imageUrl: string;
};

export type MangaReaderSessionState = Readonly<{
  available: boolean;
  authenticated: boolean;
}>;

export type MangaReaderFavoriteState = Readonly<{
  available: boolean;
  favorited: boolean;
}>;

export type MangaReaderAds = Readonly<{
  topHtml: string;
  bottomHtml: string;
}>;

type MangaReaderProps = {
  title: string;
  mangaId: number;
  chapterNumber: number;
  pages: ReaderPage[];
  pageCount: number;
  session: Promise<MangaReaderSessionState>;
  favorite: Promise<MangaReaderFavoriteState>;
  readerAds: Promise<MangaReaderAds>;
  initialPage?: number;
};

export function MangaReader({
  title,
  mangaId,
  chapterNumber,
  pages,
  pageCount,
  session,
  favorite,
  readerAds,
  initialPage = 0,
}: MangaReaderProps) {
  const boundedInitialPage = pages.length
    ? Math.min(Math.max(0, Math.floor(initialPage)), pages.length - 1)
    : 0;
  const [activePage, setActivePage] = useState(boundedInitialPage);
  const [priorityPage, setPriorityPage] = useState(boundedInitialPage);
  const [prefetchReady, setPrefetchReady] = useState(false);
  const [hasViewportTransition, setHasViewportTransition] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(
    () => new Set(getInitialReaderPages(boundedInitialPage, pages.length)),
  );
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const visiblePages = useRef(new Map<number, ReaderPageIntersection>());
  const activePageRef = useRef(boundedInitialPage);
  const priorityPageRef = useRef(boundedInitialPage);
  const lastScrollY = useRef(0);
  const scrollFrame = useRef<number | null>(null);
  const readerKey = useMemo(
    () => `manga-progress:${mangaId}:${chapterNumber}`,
    [chapterNumber, mangaId],
  );
  const totalPages = pageCount || pages.length;
  const pageIndexes = useMemo(() => new Set(pages.map((page) => page.index)), [pages]);

  const loadPages = useCallback((indexes: number[]) => {
    setLoadedPages((current) => {
      const next = new Set(current);
      indexes.forEach((index) => {
        if (pageIndexes.has(index)) next.add(index);
      });
      return next.size === current.size ? current : next;
    });
  }, [pageIndexes]);

  const registerPage = useCallback((index: number, element: HTMLElement | null) => {
    if (element) pageRefs.current.set(index, element);
    else pageRefs.current.delete(index);
  }, []);

  const commitActivePage = useCallback((index: number) => {
    if (!isReaderViewportTransition(activePageRef.current, index)) return;
    activePageRef.current = index;
    setActivePage(index);
    setHasViewportTransition(true);
    try {
      window.localStorage.setItem(readerKey, String(index));
    } catch {
      // Private browsing or storage policy may reject writes; reading continues.
    }
  }, [readerKey]);

  useLayoutEffect(() => {
    let saved: number | null = null;
    try {
      saved = getStoredReaderPage(window.localStorage.getItem(readerKey), pages.length);
    } catch {
      saved = null;
    }
    const restoredPage = saved ?? boundedInitialPage;
    if (restoredPage !== boundedInitialPage) {
      priorityPageRef.current = restoredPage;
      activePageRef.current = restoredPage;
      setPriorityPage(restoredPage);
      setActivePage(restoredPage);
      setPrefetchReady(false);
      setLoadedPages(new Set([restoredPage]));
    }
    if (restoredPage > 0) {
      pageRefs.current.get(restoredPage)?.scrollIntoView(READER_RESTORE_SCROLL_OPTIONS);
    }
  }, [boundedInitialPage, pages.length, readerKey]);

  useEffect(() => {
    const nodes = [...pageRefs.current.values()];
    if (!nodes.length) return;
    const visible = visiblePages.current;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (!Number.isInteger(index)) return;
          if (!entry.isIntersecting) {
            visible.delete(index);
            return;
          }
          visible.set(index, {
            index,
            isIntersecting: true,
            top: entry.boundingClientRect.top,
            bottom: entry.boundingClientRect.bottom,
          });
        });
        const next = selectActiveReaderPage(
          [...visible.values()],
          window.innerHeight,
          activePageRef.current,
        );
        if (next != null) commitActivePage(next);
      },
      {
        rootMargin: '0px',
        threshold: Array.from({ length: 21 }, (_, index) => index / 20),
      },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      visible.clear();
    };
  }, [commitActivePage, pages.length]);

  useEffect(() => {
    if (!prefetchReady) return;
    const nodes = [...pageRefs.current.values()];
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const nearby = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number((entry.target as HTMLElement).dataset.pageIndex))
          .filter(Number.isInteger);
        if (nearby.length) loadPages(nearby);
      },
      { rootMargin: READER_PREFETCH_ROOT_MARGIN, threshold: 0.01 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [loadPages, pages.length, prefetchReady]);

  const markPrioritySettled = useCallback((index: number) => {
    if (priorityPageRef.current === index) setPrefetchReady(true);
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onScroll = () => {
      if (scrollFrame.current != null) return;
      scrollFrame.current = window.requestAnimationFrame(() => {
        scrollFrame.current = null;
        const y = window.scrollY;
        setShowTop(y > 480);
        if (!reduceMotion.matches) {
          setChromeHidden(y > lastScrollY.current && y > 96);
        }
        lastScrollY.current = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollFrame.current != null) window.cancelAnimationFrame(scrollFrame.current);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void document.documentElement.requestFullscreen?.();
  }, []);

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
            <Suspense fallback={<ReaderFavoriteFallback />}>
              <ReaderFavoriteSlot
                state={favorite}
                mangaId={mangaId}
                chapterNumber={chapterNumber}
              />
            </Suspense>
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
          <ReaderPageList
            title={title}
            pages={pages}
            loadedPages={loadedPages}
            priorityPage={priorityPage}
            nonCriticalReady={prefetchReady}
            readerAds={readerAds}
            registerPage={registerPage}
            onPrioritySettled={markPrioritySettled}
          />
        )}
      </main>

      {hasViewportTransition ? (
        <Suspense fallback={null}>
          <ReaderProgressSlot
            session={session}
            mangaId={mangaId}
            chapterNumber={chapterNumber}
            activePage={activePage}
          />
        </Suspense>
      ) : null}

      {showTop && (
        <button
          type="button"
          className="reader-icon-button reader-to-top fixed z-40"
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

function ReaderFavoriteFallback() {
  return (
    <button
      type="button"
      className="reader-icon-button"
      aria-label="收藏状态载入中"
      disabled
    >
      <span aria-hidden className="text-[14px] leading-none">♡</span>
    </button>
  );
}

function ReaderFavoriteSlot({
  state,
  mangaId,
  chapterNumber,
}: {
  state: Promise<MangaReaderFavoriteState>;
  mangaId: number;
  chapterNumber: number;
}) {
  const favorite = use(state);
  if (!favorite.available) return <ReaderFavoriteFallback />;
  return (
    <MangaFavoriteButton
      mangaId={mangaId}
      favorited={favorite.favorited}
      returnTo={`/manga/${mangaId}/read/${chapterNumber}`}
      compact
    />
  );
}

function ReaderProgressSlot({
  session,
  mangaId,
  chapterNumber,
  activePage,
}: {
  session: Promise<MangaReaderSessionState>;
  mangaId: number;
  chapterNumber: number;
  activePage: number;
}) {
  const state = use(session);
  if (!shouldSyncReaderProgress(state)) return null;
  return (
    <ReaderCloudProgress
      mangaId={mangaId}
      chapterNumber={chapterNumber}
      activePage={activePage}
    />
  );
}

function ReaderCloudProgress({
  mangaId,
  chapterNumber,
  activePage,
}: {
  mangaId: number;
  chapterNumber: number;
  activePage: number;
}) {
  const latestPage = useRef(activePage);
  latestPage.current = activePage;

  const writeQueue = useMemo(
    () => createReaderProgressWriteQueue(async ({ pageIndex }) => {
      try {
        const response = await fetch(`/api/me/manga-progress/${mangaId}`, {
          method: 'PUT',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapterNumber, pageIndex }),
        });
        return response.ok;
      } catch {
        return false;
      }
    }),
    [chapterNumber, mangaId],
  );

  const sendProgress = useCallback(() => {
    writeQueue.enqueue(latestPage.current);
  }, [writeQueue]);

  useEffect(() => {
    const timer = window.setTimeout(sendProgress, 800);
    return () => window.clearTimeout(timer);
  }, [activePage, sendProgress]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') sendProgress();
    };
    const onPageHide = () => sendProgress();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      sendProgress();
    };
  }, [sendProgress]);

  return null;
}

const ReaderPageList = memo(function ReaderPageList({
  title,
  pages,
  loadedPages,
  priorityPage,
  nonCriticalReady,
  readerAds,
  registerPage,
  onPrioritySettled,
}: {
  title: string;
  pages: ReaderPage[];
  loadedPages: ReadonlySet<number>;
  priorityPage: number;
  nonCriticalReady: boolean;
  readerAds: Promise<MangaReaderAds>;
  registerPage: (index: number, element: HTMLElement | null) => void;
  onPrioritySettled: (index: number) => void;
}) {
  return (
    <div className="reader-stage">
      <Suspense fallback={null}>
        <ReaderAdSlot
          state={readerAds}
          position="top"
          contentReady={nonCriticalReady}
        />
      </Suspense>
      {pages.map((page) => (
        <ReaderPageItem
          key={page.index}
          title={title}
          page={page}
          loaded={loadedPages.has(page.index)}
          priority={page.index === priorityPage}
          registerPage={registerPage}
          onPrioritySettled={onPrioritySettled}
        />
      ))}
      {nonCriticalReady ? (
        <Suspense fallback={null}>
          <ReaderAdSlot state={readerAds} position="bottom" contentReady />
        </Suspense>
      ) : null}
    </div>
  );
});

const ReaderPageItem = memo(function ReaderPageItem({
  title,
  page,
  loaded,
  priority,
  registerPage,
  onPrioritySettled,
}: {
  title: string;
  page: ReaderPage;
  loaded: boolean;
  priority: boolean;
  registerPage: (index: number, element: HTMLElement | null) => void;
  onPrioritySettled: (index: number) => void;
}) {
  const elementRef = useRef<HTMLElement | null>(null);
  const settling = useRef(false);
  const requestPolicy = getReaderImageRequestPolicy(priority);

  const setElement = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
    registerPage(page.index, element);
  }, [page.index, registerPage]);

  const markReadable = useCallback((image: HTMLImageElement) => {
    if (!priority || settling.current) return;
    settling.current = true;
    void Promise.resolve(image.decode?.())
      .catch(() => undefined)
      .then(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (image.naturalWidth > 0) {
              performance.mark(`manga-reader-page-${page.index}-readable`);
            }
            onPrioritySettled(page.index);
          });
        });
      });
  }, [onPrioritySettled, page.index, priority]);

  useEffect(() => {
    settling.current = false;
    if (!priority || !loaded) return;
    const image = elementRef.current?.querySelector<HTMLImageElement>('img.reader-image');
    if (!image?.complete) return;
    if (image.naturalWidth > 0) markReadable(image);
    else onPrioritySettled(page.index);
  }, [loaded, markReadable, onPrioritySettled, page.imageUrl, page.index, priority]);

  const onLoadCapture = useCallback((event: SyntheticEvent<HTMLElement>) => {
    if (event.target instanceof HTMLImageElement && event.target.classList.contains('reader-image')) {
      markReadable(event.target);
    }
  }, [markReadable]);

  const onErrorCapture = useCallback((event: SyntheticEvent<HTMLElement>) => {
    if (
      priority
      && event.target instanceof HTMLImageElement
      && event.target.classList.contains('reader-image')
    ) {
      onPrioritySettled(page.index);
    }
  }, [onPrioritySettled, page.index, priority]);

  return (
    <figure
      ref={setElement}
      data-page-index={page.index}
      className="reader-page"
      onLoadCapture={onLoadCapture}
      onErrorCapture={onErrorCapture}
    >
      {loaded ? (
        <MediaImage
          src={page.imageUrl}
          alt={`${title} P${page.index + 1}`}
          width={900}
          height={1280}
          className="reader-image"
          loading={requestPolicy.loading}
          fetchPriority={requestPolicy.fetchPriority}
          decoding="async"
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
  );
});

function ReaderAdSlot({
  state,
  position,
  contentReady,
}: {
  state: Promise<MangaReaderAds>;
  position: 'top' | 'bottom';
  contentReady: boolean;
}) {
  const ads = use(state);
  const html = (position === 'top' ? ads.topHtml : ads.bottomHtml).trim();
  const policy = getReaderAdRenderPolicy(html, contentReady);
  if (!policy.reserveSlot) return null;
  return (
    <aside
      className="reader-ad reader-ad-banner"
      aria-label={position === 'top' ? '章节顶部广告' : '章节底部广告'}
      aria-busy={!policy.mountContent}
    >
      {policy.mountContent ? (
        <HtmlAd html={html} />
      ) : (
        <div className="reader-ad-reserved" aria-hidden="true" />
      )}
    </aside>
  );
}
