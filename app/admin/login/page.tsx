import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { actionLogin } from '../actions';

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session.isLoggedIn && session.role === 'admin') {
    redirect('/admin');
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <p className="font-meta mb-2">Admin</p>
      <h1 className="font-serif text-3xl mb-6">登录管理后台</h1>
      <form action={actionLogin} className="surface-card p-6 space-y-4">
        <div>
          <label className="admin-label" htmlFor="username">
            用户名
          </label>
          <input id="username" name="username" className="admin-input" required autoComplete="username" />
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
          登录
        </button>
      </form>
    </div>
  );
}
