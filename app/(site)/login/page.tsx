import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getIdentityService } from '@/lib/server/identity';
import { actionPublicLogin } from '../auth/actions';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const user = await getIdentityService().getCurrentUser();
  if (user) {
    redirect(user.role === 'admin' ? '/admin' : (sp.next?.startsWith('/') ? sp.next : '/favorites'));
  }

  return (
    <div className="mx-auto max-w-sm px-4 sm:px-6 py-12 sm:py-16">
      <p className="font-meta mb-2">Account</p>
      <h1 className="font-serif text-3xl mb-2">登录</h1>
      <p className="font-ui text-sm text-[#787774] mb-6">
        使用注册邮箱登录，收藏会同步到云端。
      </p>

      {sp.error && (
        <p className="mb-4 font-ui text-sm text-[#C5221F]">
          邮箱或密码不正确，请重试。
        </p>
      )}

      <form action={actionPublicLogin} className="surface-card p-6 space-y-4">
        <input type="hidden" name="next" value={sp.next || '/favorites'} />
        <div>
          <label className="admin-label" htmlFor="email">
            邮箱
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="admin-input"
            placeholder="you@example.com"
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
            required
            minLength={8}
            autoComplete="current-password"
            className="admin-input"
          />
        </div>
        <button type="submit" className="btn-ink w-full">
          登录
        </button>
      </form>

      <p className="mt-6 font-ui text-sm text-[#787774] text-center">
        还没有账号？{' '}
        <Link
          href={`/register${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ''}`}
          className="text-[#111] underline"
        >
          注册
        </Link>
      </p>
    </div>
  );
}
