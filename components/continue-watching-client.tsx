'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HorizontalCarousel } from '@/components/horizontal-carousel';
import { LibraryPagination } from '@/components/library-pagination';
import { MediaImage } from '@/components/media-image';
import {
  clearLocalWatchProgress,
  readLocalWatchProgress,
  writeLocalWatchProgress,
  type LocalWatchProgress,
} from '@/lib/client/watch-progress-storage';

function ProgressCard({
  href,
  title,
  cover,
  positionSeconds,
  durationSeconds,
  completed,
}: {
  href: string;
  title: string;
  cover: string | null;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
}) {
  const pct =
    durationSeconds > 0
      ? Math.min(100, Math.round((positionSeconds / durationSeconds) * 100))
      : completed
        ? 100
        : 0;

  return (
    <Link href={href} className="group block space-y-2">
      <div className="poster-frame aspect-[2/3]">
        <MediaImage
          src={cover}
          alt={title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          variant="poster"
        />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-ink/25">
          <div className="h-full bg-background" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div>
        <p className="font-ui text-[13px] font-medium text-ink line-clamp-2 leading-snug">
          {title}
        </p>
        <p className="font-meta text-[11px] normal-case tracking-normal text-soft mt-1">
          {completed ? '已看完' : pct > 0 ? `继续 · ${pct}%` : '继续观看'}
        </p>
      </div>
    </Link>
  );
}

export function GuestContinueWatching({ cardWidth }: { cardWidth: string }) {
  const [rows, setRows] = useState<LocalWatchProgress[]>([]);

  useEffect(() => {
    setRows(
      readLocalWatchProgress()
        .filter((r) => !r.completed && r.positionSeconds > 5)
        .slice(0, 12),
    );
  }, []);

  if (!rows.length) return null;

  return (
    <HorizontalCarousel title="继续观看" viewAllHref="/history">
      {rows.map((r) => (
        <div key={r.animeId} className={`shrink-0 snap-start ${cardWidth}`}>
          <ProgressCard
            href={`/watch/${r.animeId}`}
            title={r.title || `作品 #${r.animeId}`}
            cover={r.cover ?? null}
            positionSeconds={r.positionSeconds}
            durationSeconds={r.durationSeconds}
            completed={r.completed}
          />
        </div>
      ))}
    </HorizontalCarousel>
  );
}

const GUEST_HISTORY_PAGE_SIZE = 20;

export function GuestHistoryList({ initialPage = 1 }: { initialPage?: number }) {
  const [rows, setRows] = useState<LocalWatchProgress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setRows(readLocalWatchProgress());
    setLoaded(true);
  }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / GUEST_HISTORY_PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(initialPage) || 1));

  useEffect(() => {
    if (!loaded || page === initialPage) return;
    router.replace(page > 1 ? `/history?page=${page}` : '/history', { scroll: false });
  }, [initialPage, loaded, page, router]);

  if (!rows.length) {
    return (
      <div className="empty-state space-y-4">
        <p className="font-meta">History</p>
        <p className="section-title text-2xl text-ink">本机还没有观看记录</p>
        <p className="font-ui text-sm text-soft">从里番馆挑一部开始，进度会保存在此设备。</p>
        <Link href="/browse" className="btn-ink inline-flex">
          去里番馆
        </Link>
      </div>
    );
  }

  const visibleRows = rows.slice(
    (page - 1) * GUEST_HISTORY_PAGE_SIZE,
    page * GUEST_HISTORY_PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      <ul className="space-y-3">
        {visibleRows.map((r) => {
        const pct =
          r.durationSeconds > 0
            ? Math.min(100, Math.round((r.positionSeconds / r.durationSeconds) * 100))
            : r.completed
              ? 100
              : 0;
        return (
          <li
            key={r.animeId}
            className="surface-card flex items-center justify-between gap-4 p-3.5 sm:p-4"
          >
            <Link href={`/watch/${r.animeId}`} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-border">
                <MediaImage
                  src={r.cover}
                  alt={r.title || `作品 ${r.animeId}`}
                  className="h-full w-full object-cover"
                  variant="thumb"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-ui text-sm font-medium text-ink">
                  {r.title || `#${r.animeId}`}
                </p>
                <p className="font-meta mt-0.5 text-[11px] normal-case tracking-normal text-soft">
                  {r.completed ? '已看完' : pct > 0 ? `进度 ${pct}%` : `进度 ${Math.floor(r.positionSeconds)}s`}
                </p>
                {(pct > 0 || r.completed) && (
                  <div className="mt-2 h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-ink"
                      style={{ width: `${r.completed ? 100 : pct}%` }}
                    />
                  </div>
                )}
              </div>
            </Link>
            <button
              type="button"
              className="shrink-0 rounded-full px-3 py-1.5 font-ui text-[12px] text-soft transition hover:bg-secondary hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => {
                const next = rows.filter((x) => x.animeId !== r.animeId);
                writeLocalWatchProgress(next);
                setRows(next);
              }}
            >
              清除
            </button>
          </li>
        );
        })}
      </ul>
      <div className="flex flex-col items-center gap-4">
        <LibraryPagination
          page={page}
          totalPages={totalPages}
          total={rows.length}
          basePath="/history"
          ariaLabel="本机观看历史分页"
        />
        <button
          type="button"
          className="btn-danger !text-[13px]"
          onClick={() => {
            clearLocalWatchProgress();
            setRows([]);
          }}
        >
          清除本机全部历史
        </button>
      </div>
    </div>
  );
}
