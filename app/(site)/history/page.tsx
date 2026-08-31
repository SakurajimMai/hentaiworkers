import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { GuestHistoryList } from '@/components/continue-watching-client';
import { LibraryPagination } from '@/components/library-pagination';
import { MediaImage } from '@/components/media-image';
import { buildPaginationHref, type PaginationQuery } from '@/components/pagination-model';
import { getIdentityService } from '@/lib/server/identity';
import { listLibraryHistoryPage } from '@/lib/server/library-pagination';
import { buildPublicLoginHref } from '@/lib/server/shared/auth-navigation';
import {
  isCanonicalPageParam,
  parsePageParam,
} from '@/lib/server/shared/pagination';
import { noIndexMetadata } from '@/lib/seo';
import {
  actionClearAllWatchProgress,
  actionClearWatchProgress,
} from '../auth/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '观看历史',
  ...noIndexMetadata,
};

function formatProgress(position: number, duration: number, completed: boolean): string {
  if (completed) return '已看完';
  if (duration > 0) {
    const pct = Math.min(100, Math.round((position / duration) * 100));
    return `看到 ${pct}%`;
  }
  const m = Math.floor(position / 60);
  const s = position % 60;
  return m > 0 ? `看到 ${m}分${s}秒` : `看到 ${s}秒`;
}

function firstValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

type HistorySearchParams = PaginationQuery & { error?: string | readonly string[] };

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: Promise<HistorySearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedPage = parsePageParam(sp.page);
  const operationError = firstValue(sp.error);
  const requestedPageHref = buildPaginationHref('/history', requestedPage);
  const requestedHref = buildPaginationHref(
    '/history',
    requestedPage,
    operationError ? { error: operationError } : undefined,
  );
  if (!isCanonicalPageParam(sp.page, requestedPage)) {
    redirect(requestedHref);
  }
  const user = await getIdentityService().getCurrentUser();

  if (!user) {
    return (
      <div className="page-shell space-y-8 py-8 pb-20 sm:py-12">
        <div className="max-w-xl">
          <p className="font-meta mb-2">History</p>
          <h1 className="section-title text-3xl text-ink">观看历史</h1>
          <p className="mt-2 font-ui text-sm leading-relaxed text-soft">
            未登录时进度保存在本机。登录后可跨设备同步，并可在登录时合并本机记录。
          </p>
          <p className="mt-5">
            <Link
              href={buildPublicLoginHref(requestedPageHref)}
              className="btn-ink !text-[13px]"
            >
              登录以同步
            </Link>
          </p>
        </div>
        <GuestHistoryList initialPage={requestedPage} />
      </div>
    );
  }

  let history;
  try {
    history = await listLibraryHistoryPage(user.id, requestedPage);
  } catch (error) {
    console.error('Failed to load library history', error);
    const retryHref = buildPaginationHref('/history', requestedPage);
    return (
      <div className="page-shell space-y-8 py-8 pb-20 sm:py-12">
        <div>
          <p className="font-meta mb-2">History</p>
          <h1 className="section-title text-3xl text-ink">观看历史</h1>
          <p className="mt-2 font-ui text-sm text-soft">
            {user.displayName || user.username} · 跨设备同步
          </p>
        </div>
        <div className="notice-error space-y-3 !text-sm">
          <p>历史记录暂时加载失败，请稍后重试。</p>
          <Link href={retryHref} className="btn-ghost inline-flex !text-[13px]">
            重新加载
          </Link>
        </div>
      </div>
    );
  }

  const canonicalHref = buildPaginationHref(
    '/history',
    history.page,
    operationError ? { error: operationError } : undefined,
  );
  if (!isCanonicalPageParam(sp.page, history.page)) {
    redirect(canonicalHref);
  }
  const pageHref = buildPaginationHref('/history', history.page);

  return (
    <div className="page-shell space-y-8 py-8 pb-20 sm:py-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-meta mb-2">History</p>
          <h1 className="section-title text-3xl text-ink">观看历史</h1>
          <p className="mt-2 font-ui text-sm text-soft">
            {user.displayName || user.username} · 共{' '}
            <span className="tabular">{history.total}</span> 条 · 跨设备同步
          </p>
        </div>
        {history.total > 0 && (
          <form action={actionClearAllWatchProgress}>
            <ConfirmSubmitButton
              title="清除确认"
              message="确定清除全部观看历史？此操作不可撤销。"
              className="btn-danger !text-[13px]"
              confirmLabel="清除全部"
            >
              清除全部
            </ConfirmSubmitButton>
          </form>
        )}
      </div>

      {operationError && (
        <div className="notice-error !text-sm">操作失败，请重试。</div>
      )}

      {history.total === 0 ? (
        <div className="empty-state space-y-4">
          <p className="font-meta">Cloud history</p>
          <p className="section-title text-2xl text-ink">还没有云端记录</p>
          <p className="font-ui text-sm text-soft">播放里番或阅读漫画后会写入账号。</p>
          <Link href="/browse" className="btn-ink inline-flex">
            去里番馆
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <ul className="space-y-3">
            {history.items.map((item) => {
              if (item.kind === 'manga') {
                return (
                  <li
                    key={`manga-${item.recordId}`}
                    className="surface-card flex items-center justify-between gap-4 p-3.5 sm:p-4"
                  >
                    <Link
                      href={`/manga/${item.slug}/read/${item.chapterNumber}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-border">
                        <MediaImage
                          src={item.coverUrl}
                          alt={item.title}
                          className="h-full w-full object-cover"
                          variant="thumb"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-ui text-sm font-medium text-ink">{item.title}</p>
                        <p className="font-meta mt-0.5 text-[11px] normal-case tracking-normal text-soft">
                          漫画 · 读到第 {item.chapterNumber} 话 ·{' '}
                          {new Date(item.activityAt).toLocaleString()}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              }

              const pct = item.durationSeconds > 0
                ? Math.min(100, Math.round((item.positionSeconds / item.durationSeconds) * 100))
                : item.completed
                  ? 100
                  : 0;
              return (
                <li
                  key={`anime-${item.recordId}`}
                  className="surface-card flex items-center justify-between gap-4 p-3.5 sm:p-4"
                >
                  <Link href={`/watch/${item.animeId}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-border">
                      <MediaImage
                        src={item.cover}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        variant="thumb"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-ui text-sm font-medium text-ink">{item.title}</p>
                      <p className="font-meta mt-0.5 text-[11px] normal-case tracking-normal text-soft">
                        {formatProgress(item.positionSeconds, item.durationSeconds, item.completed)} ·{' '}
                        {new Date(item.activityAt).toLocaleString()}
                      </p>
                      {(pct > 0 || item.completed) && (
                        <div className="mt-2 h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-ink"
                            style={{ width: `${item.completed ? 100 : pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </Link>
                  <form action={actionClearWatchProgress}>
                    <input type="hidden" name="animeId" value={item.animeId} />
                    <input type="hidden" name="returnTo" value={pageHref} />
                    <button
                      type="submit"
                      className="shrink-0 rounded-full px-3 py-1.5 font-ui text-[12px] text-soft transition hover:bg-secondary hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.98]"
                    >
                      清除
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
          <LibraryPagination
            page={history.page}
            totalPages={history.totalPages}
            total={history.total}
            basePath="/history"
            ariaLabel="观看历史分页"
          />
        </div>
      )}
    </div>
  );
}
