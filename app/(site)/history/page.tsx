import Link from 'next/link';
import { getIdentityService, getWatchProgressService } from '@/lib/server/identity';
import { GuestHistoryList } from '@/components/continue-watching-client';
import { MediaImage } from '@/components/media-image';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import {
  actionClearAllWatchProgress,
  actionClearWatchProgress,
} from '../auth/actions';

import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/seo';

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

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const user = await getIdentityService().getCurrentUser();

  if (!user) {
    return (
      <div className="page-shell py-8 sm:py-12 pb-20 space-y-8">
        <div className="max-w-xl">
          <p className="font-meta mb-2">History</p>
          <h1 className="section-title text-3xl text-ink">观看历史</h1>
          <p className="mt-2 font-ui text-sm text-soft leading-relaxed">
            未登录时进度保存在本机。登录后可跨设备同步，并可在登录时合并本机记录。
          </p>
          <p className="mt-5">
            <Link href="/login?next=/history" className="btn-ink !text-[13px]">
              登录以同步
            </Link>
          </p>
        </div>
        <GuestHistoryList />
      </div>
    );
  }

  const items = await getWatchProgressService().listMine(100);

  return (
    <div className="page-shell py-8 sm:py-12 pb-20 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-meta mb-2">History</p>
          <h1 className="section-title text-3xl text-ink">观看历史</h1>
          <p className="mt-2 font-ui text-sm text-soft">
            {user.displayName || user.username} · 共{' '}
            <span className="tabular">{items.length}</span> 条 · 跨设备同步
          </p>
        </div>
        {items.length > 0 && (
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

      {sp.error && (
        <div className="notice-error !text-sm">
          操作失败，请重试。
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state space-y-4">
          <p className="font-meta">Cloud history</p>
          <p className="section-title text-2xl text-ink">还没有云端观看记录</p>
          <p className="font-ui text-sm text-soft">播放几秒以上后会自动写入进度。</p>
          <Link href="/browse" className="btn-ink inline-flex">
            去里番馆
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const pct =
              item.durationSeconds > 0
                ? Math.min(100, Math.round((item.positionSeconds / item.durationSeconds) * 100))
                : item.completed
                  ? 100
                  : 0;
            return (
              <li
                key={item.animeId}
                className="surface-card p-3.5 sm:p-4 flex items-center gap-4 justify-between"
              >
                <Link
                  href={`/watch/${item.animeId}`}
                  className="flex items-center gap-3 min-w-0 flex-1"
                >
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-border">
                    <MediaImage
                      src={item.cover}
                      alt={item.title}
                      className="h-full w-full object-cover"
                      variant="thumb"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-ui text-sm font-medium text-ink truncate">
                      {item.title}
                    </p>
                    <p className="mt-0.5 font-meta text-[11px] normal-case tracking-normal text-soft">
                      {formatProgress(
                        item.positionSeconds,
                        item.durationSeconds,
                        item.completed,
                      )}
                      {' · '}
                      {new Date(item.lastWatchedAt).toLocaleString()}
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
                  <button
                    type="submit"
                    className="rounded-full px-3 py-1.5 font-ui text-[12px] text-soft hover:bg-secondary hover:text-destructive shrink-0 transition active:scale-[0.98]"
                  >
                    清除
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
