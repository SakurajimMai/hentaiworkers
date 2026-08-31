import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { IconBookmark, IconHistory, IconShield } from '@/components/icons';
import { getFavoritesService, getIdentityService } from '@/lib/server/identity';
import { listMangaFavoritesPage } from '@/lib/server/manga-favorites';
import {
  actionChangeMyPassword,
  actionPublicLogout,
  actionUpdateProfile,
} from '../auth/actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '用户中心',
  robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
  profile: '资料保存失败，请重试。',
  current: '当前密码不正确。',
  password: '新密码至少 8 位，且两次输入需一致。',
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const user = await getIdentityService().getCurrentUser();
  if (!user) {
    redirect('/login?next=/account');
  }

  const [animeFavorites, mangaFavorites] = await Promise.all([
    getFavoritesService().listMinePage(1, 1).catch(() => null),
    listMangaFavoritesPage(1, 1).catch(() => null),
  ]);
  const isAdmin = user.role === 'admin';

  return (
    <div className="page-shell py-8 sm:py-12 pb-20 space-y-8 !max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-meta mb-2">Account</p>
          <h1 className="section-title text-3xl text-ink">用户中心</h1>
          <p className="mt-2 font-ui text-sm text-soft">
            {user.displayName || user.username}
            {isAdmin && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 font-ui text-[11px] font-medium text-accent align-middle">
                <IconShield size={11} />
                管理员
              </span>
            )}
          </p>
        </div>
        <form action={actionPublicLogout}>
          <button type="submit" className="btn-ghost !text-[13px]">
            退出登录
          </button>
        </form>
      </div>

      {sp.ok === 'profile' && <div className="notice-success">资料已保存。</div>}
      {sp.error && <div className="notice-error">{ERRORS[sp.error] ?? '操作失败，请重试。'}</div>}

      {isAdmin && (
        <Link
          href="/admin"
          className="surface-panel flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-ink"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <IconShield size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-ui text-[15px] font-semibold text-ink">管理中心</span>
            <span className="mt-0.5 block font-ui text-[12px] text-soft">
              管理里番、漫画、标签、用户与系统设置
            </span>
          </span>
          <span className="font-ui text-[13px] text-soft">进入 →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/favorites"
          className="surface-card flex items-center gap-3 p-4 transition hover:shadow-whisper"
        >
          <IconBookmark size={17} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block font-ui text-[13px] font-medium text-ink">我的收藏</span>
            <span className="block font-meta text-[11px] normal-case tracking-normal">
              里番 {animeFavorites?.total ?? '—'} · 漫画 {mangaFavorites?.total ?? '—'}
            </span>
          </span>
        </Link>
        <Link
          href="/history"
          className="surface-card flex items-center gap-3 p-4 transition hover:shadow-whisper"
        >
          <IconHistory size={17} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block font-ui text-[13px] font-medium text-ink">观看历史</span>
            <span className="block font-meta text-[11px] normal-case tracking-normal">
              继续观看与记录
            </span>
          </span>
        </Link>
      </div>

      <section className="surface-panel p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-ui text-sm font-semibold text-ink">账号资料</h2>
          <p className="mt-1 font-ui text-[12px] text-soft">
            登录邮箱 {user.username} · 注册于{' '}
            {formatDate(user.createdAt as Date | string | null | undefined)}
          </p>
        </div>
        <form action={actionUpdateProfile} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="admin-label" htmlFor="displayName">
              显示名（站内展示，可留空）
            </label>
            <input
              id="displayName"
              name="displayName"
              maxLength={64}
              defaultValue={user.displayName ?? ''}
              placeholder={user.username.split('@')[0]}
              className="admin-input"
            />
          </div>
          <button type="submit" className="btn-ink shrink-0 !text-[13px]">
            保存资料
          </button>
        </form>
      </section>

      <section className="surface-panel p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-ui text-sm font-semibold text-ink">修改密码</h2>
          <p className="mt-1 font-ui text-[12px] text-soft">
            修改成功后需要用新密码重新登录。
          </p>
        </div>
        <form action={actionChangeMyPassword} className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="admin-label" htmlFor="current">
              当前密码
            </label>
            <input
              id="current"
              name="current"
              type="password"
              required
              autoComplete="current-password"
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="next">
              新密码（≥8 位）
            </label>
            <input
              id="next"
              name="next"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="admin-input"
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="confirm">
              确认新密码
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="admin-input"
            />
          </div>
          <div className="sm:col-span-3">
            <button type="submit" className="btn-ink !text-[13px]">
              更新密码
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
