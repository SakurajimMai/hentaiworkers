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
import { ReaderImageScheduler } from '@/components/manga-reader-scheduler';
import {
  clampReaderPage,
  getReaderAdRenderPolicy,
  getReaderImageRequestPolicy,
  getStoredReaderPage,
  isReaderViewportTransition,
  READER_INITIAL_PREFETCH_DELAY_MS,
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

export function MangaReader(props: MangaReaderProps) {
  return <MangaReaderEntry key={`${props.mangaId}:${props.chapterNumber}`} {...props} />;
}

function MangaReaderEntry({
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
  const boundedInitialPage = pages.find((page) => page.index === initialPage)?.index
    ?? pages[clampReaderPage(initialPage, pages.length)]?.index
    ?? 0;
  const [activePage, setActivePage] = useState(boundedInitialPage);
  const [initialPriorityPage, setInitialPriorityPage] = useState(boundedInitialPage);
  const [adsReady, setAdsReady] = useState(false);
  const [hasViewportTransition, setHasViewportTransition] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scheduler, setScheduler] = useState(
    () => new ReaderImageScheduler(pages.map((page) => page.index), boundedInitialPage),
  );
  // Resolve browser-only restoration before admitting speculative neighbors.
  const [admittedPages, setAdmittedPages] = useState<ReadonlySet<number>>(
    () => new Set(pages.length > 0 ? [boundedInitialPage] : []),
  );
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const visiblePages = useRef(new Map<number, ReaderPageIntersection>());
  const activePageRef = useRef(boundedInitialPage);
  const initialPriorityPageRef = useRef(boundedInitialPage);
  const lastScrollY = useRef(0);
  const scrollFrame = useRef<number | null>(null);
  const readerKey = useMemo(
    () => `manga-progress:${mangaId}:${chapterNumber}`,
    [chapterNumber, mangaId],
  );
  const totalPages = pageCount || pages.length;

  const settlePage = useCallback((index: number, result: 'success' | 'error') => {
    if (scheduler.settle(index, result)) setAdmittedPages(scheduler.admittedPages);
  }, [scheduler]);

  const retryPage = useCallback((index: number) => scheduler.retry(index), [scheduler]);

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
    const indexes = [...pageRefs.current.keys()];
    const pageBound = indexes.reduce((maximum, index) => Math.max(maximum, index + 1), 0);
    let saved: number | null = null;
    try {
      saved = getStoredReaderPage(window.localStorage.getItem(readerKey), pageBound);
      if (saved != null && !indexes.includes(saved)) saved = null;
    } catch {
      saved = null;
    }
    const restoredPage = saved ?? boundedInitialPage;
    if (restoredPage !== boundedInitialPage) {
      initialPriorityPageRef.current = restoredPage;
      activePageRef.current = restoredPage;
      setInitialPriorityPage(restoredPage);
      setActivePage(restoredPage);
      setAdsReady(false);
    }
    const restoredScheduler = new ReaderImageScheduler(indexes, restoredPage, false);
    setScheduler(restoredScheduler);
    setAdmittedPages(restoredScheduler.admittedPages);
    if (restoredPage > 0) {
      pageRefs.current.get(restoredPage)?.scrollIntoView(READER_RESTORE_SCROLL_OPTIONS);
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    // Give the critical transfer a short head start. A slow or failed first image
    // cannot hold speculative work indefinitely, and viewport admission bypasses this.
    const prefetchTimer = window.setTimeout(() => {
      if (restoredScheduler.enablePrefetch()) setAdmittedPages(restoredScheduler.admittedPages);
    }, READER_INITIAL_PREFETCH_DELAY_MS);
    return () => window.clearTimeout(prefetchTimer);
  }, [boundedInitialPage, pages.length, readerKey]);

  const refreshViewport = useCallback(() => {
    // IntersectionObserver entries are only deltas. Refresh geometry so long pages
    // and rapid scrolls cannot leave an old reading-line candidate behind.
    const intersections = [...visiblePages.current.keys()].flatMap((index) => {
      const node = pageRefs.current.get(index);
      if (!node) return [];
      const bounds = node.getBoundingClientRect();
      return [{ index, isIntersecting: true, top: bounds.top, bottom: bounds.bottom }];
    });
    const visible = intersections.filter((entry) => entry.bottom > 0 && entry.top < window.innerHeight);
    const next = selectActiveReaderPage(visible, window.innerHeight, activePageRef.current);
    if (next != null) {
      if (scheduler.updateViewport(next, visible.map((entry) => entry.index))) {
        setAdmittedPages(scheduler.admittedPages);
      }
      commitActivePage(next);
    }
  }, [commitActivePage, scheduler]);

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
        refreshViewport();
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
  }, [pages.length, refreshViewport]);

  const markPrioritySettled = useCallback((index: number) => {
    if (initialPriorityPageRef.current === index) setAdsReady(true);
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onScroll = () => {
      if (scrollFrame.current != null) return;
      scrollFrame.current = window.requestAnimationFrame(() => {
        scrollFrame.current = null;
        refreshViewport();
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
  }, [refreshViewport]);

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
            admittedPages={admittedPages}
            priorityPage={activePage}
            initialPriorityPage={initialPriorityPage}
            nonCriticalReady={adsReady}
            readerAds={readerAds}
            registerPage={registerPage}
            onPrioritySettled={markPrioritySettled}
            onSettled={settlePage}
            onRetry={retryPage}
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
  admittedPages,
  priorityPage,
  initialPriorityPage,
  nonCriticalReady,
  readerAds,
  registerPage,
  onPrioritySettled,
  onSettled,
  onRetry,
}: {
  title: string;
  pages: ReaderPage[];
  admittedPages: ReadonlySet<number>;
  priorityPage: number;
  initialPriorityPage: number;
  nonCriticalReady: boolean;
  readerAds: Promise<MangaReaderAds>;
  registerPage: (index: number, element: HTMLElement | null) => void;
  onPrioritySettled: (index: number) => void;
  onSettled: (index: number, result: 'success' | 'error') => void;
  onRetry: (index: number) => void;
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
          admitted={admittedPages.has(page.index)}
          priority={page.index === priorityPage}
          initialPriority={page.index === initialPriorityPage}
          registerPage={registerPage}
          onPrioritySettled={onPrioritySettled}
          onSettled={onSettled}
          onRetry={onRetry}
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
  admitted,
  priority,
  initialPriority,
  registerPage,
  onPrioritySettled,
  onSettled,
  onRetry,
}: {
  title: string;
  page: ReaderPage;
  admitted: boolean;
  priority: boolean;
  initialPriority: boolean;
  registerPage: (index: number, element: HTMLElement | null) => void;
  onPrioritySettled: (index: number) => void;
  onSettled: (index: number, result: 'success' | 'error') => void;
  onRetry: (index: number) => void;
}) {
  const elementRef = useRef<HTMLElement | null>(null);
  const readableImage = useRef<HTMLImageElement | null>(null);
  const readableFrame = useRef<number | null>(null);
  const requestPolicy = getReaderImageRequestPolicy(priority);

  const setElement = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
    registerPage(page.index, element);
  }, [page.index, registerPage]);

  const markReadable = useCallback((image: HTMLImageElement) => {
    if (readableImage.current === image) return;
    readableImage.current = image;
    void Promise.resolve(image.decode?.())
      .catch(() => undefined)
      .then(() => {
        if (readableImage.current !== image || !image.isConnected) return;
        readableFrame.current = window.requestAnimationFrame(() => {
          readableFrame.current = window.requestAnimationFrame(() => {
            readableFrame.current = null;
            if (readableImage.current !== image || !image.isConnected) return;
            if (image.naturalWidth > 0) {
              performance.mark(`manga-reader-page-${page.index}-readable`);
            }
            if (initialPriority) onPrioritySettled(page.index);
          });
        });
      });
  }, [initialPriority, onPrioritySettled, page.index]);

  useEffect(() => {
    if (!admitted) return;
    if (!page.imageUrl) {
      onSettled(page.index, 'error');
      if (initialPriority) onPrioritySettled(page.index);
      return;
    }
    const image = elementRef.current?.querySelector<HTMLImageElement>('img.reader-image');
    if (!image?.complete) return;
    if (image.naturalWidth > 0) {
      onSettled(page.index, 'success');
      markReadable(image);
    } else {
      onSettled(page.index, 'error');
      if (initialPriority) onPrioritySettled(page.index);
    }
  }, [admitted, initialPriority, markReadable, onPrioritySettled, onSettled, page.imageUrl, page.index]);

  useEffect(() => () => {
    readableImage.current = null;
    if (readableFrame.current != null) window.cancelAnimationFrame(readableFrame.current);
  }, [page.imageUrl]);

  const onLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    onSettled(page.index, 'success');
    markReadable(event.currentTarget);
  }, [markReadable, onSettled, page.index]);

  const onError = useCallback(() => {
    onSettled(page.index, 'error');
    if (initialPriority) onPrioritySettled(page.index);
  }, [initialPriority, onPrioritySettled, onSettled, page.index]);

  const retry = useCallback(() => onRetry(page.index), [onRetry, page.index]);

  return (
    <figure
      ref={setElement}
      data-page-index={page.index}
      className="reader-page"
    >
      {admitted ? (
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
          onLoad={onLoad}
          onError={onError}
          onRetry={retry}
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
