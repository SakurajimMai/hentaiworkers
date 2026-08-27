import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { actionLogin } from '../actions';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await getSession();
  if (session.isLoggedIn && session.role === 'admin') {
    redirect('/admin');
  }
  const sp = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <header>
          <p className="font-meta mb-2">管理中心</p>
          <h1 className="section-title text-3xl text-ink sm:text-4xl">登录后台</h1>
          <p className="mt-2 font-ui text-sm leading-relaxed text-soft">
            仅管理员可进入。改密后也会回到这一页。
          </p>
        </header>

        {sp.ok === 'password' && (
          <div className="notice-success">密码已更新，请使用新密码登录。</div>
        )}
        {sp.error === '1' && (
          <div className="notice-error">用户名或密码不正确。</div>
        )}

        <form action={actionLogin} className="surface-panel p-6 sm:p-7 space-y-4">
          <div>
            <label className="admin-label" htmlFor="username">
              用户名
            </label>
            <input
              id="username"
              name="username"
              className="admin-input"
              required
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label className="admin-label" htmlFor="password">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="admin-input"
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn-ink w-full">
            进入管理中心
          </button>
        </form>

        <p className="text-center font-ui text-sm text-soft">
          <Link
            href="/"
            className="text-ink font-medium underline decoration-line underline-offset-2 hover:decoration-ink"
          >
            返回前台
          </Link>
        </p>
      </div>
    </div>
  );
}
