'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HorizontalCarousel } from '@/components/horizontal-carousel';
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
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-meta text-[11px] normal-case tracking-normal text-[#8a877f]">
            无封面
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-[#1a1917]/25">
          <div className="h-full bg-white" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div>
        <p className="font-ui text-[13px] font-medium text-ink line-clamp-2 leading-snug">
          {title}
        </p>
        <p className="font-meta text-[11px] normal-case tracking-normal text-[#8a877f] mt-1">
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
    <HorizontalCarousel title="继续观看" meta="This device" viewAllHref="/history">
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

export function GuestHistoryList() {
  const [rows, setRows] = useState<LocalWatchProgress[]>([]);

  useEffect(() => {
    setRows(readLocalWatchProgress());
  }, []);

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

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct =
          r.durationSeconds > 0
            ? Math.min(100, Math.round((r.positionSeconds / r.durationSeconds) * 100))
            : r.completed
              ? 100
              : 0;
        return (
          <li
            key={r.animeId}
            className="surface-card p-3.5 sm:p-4 flex items-center gap-4 justify-between"
          >
            <Link href={`/watch/${r.animeId}`} className="flex items-center gap-3 min-w-0 flex-1">
              {r.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.cover}
                  alt={r.title || `作品 ${r.animeId}`}
                  className="h-16 w-12 object-cover rounded-xl border border-[#e8e4dc]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-16 w-12 rounded-xl bg-[#f0eee9]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-ui text-sm font-medium text-ink truncate">
                  {r.title || `#${r.animeId}`}
                </p>
                <p className="mt-0.5 font-meta text-[11px] normal-case tracking-normal text-[#8a877f]">
                  {r.completed ? '已看完' : pct > 0 ? `进度 ${pct}%` : `进度 ${Math.floor(r.positionSeconds)}s`}
                </p>
                {(pct > 0 || r.completed) && (
                  <div className="mt-2 h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-[#ece8e0]">
                    <div
                      className="h-full rounded-full bg-[#1a1917]"
                      style={{ width: `${r.completed ? 100 : pct}%` }}
                    />
                  </div>
                )}
              </div>
            </Link>
            <button
              type="button"
              className="rounded-full px-3 py-1.5 font-ui text-[12px] text-[#6f6d68] hover:bg-[#f5f3ee] hover:text-[#9F2F2D] shrink-0 transition"
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
      <li className="pt-1">
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
      </li>
    </ul>
  );
}
