import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TurnstileField } from '@/components/turnstile-field';
import { getIdentityService } from '@/lib/server/identity';
import { getSystemSettingsService } from '@/lib/server/system';
import { actionPublicLogin } from '../auth/actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  '1': '邮箱或密码不正确，请重试。',
  verify: '账号未完成邮箱验证，请查收邮件中的链接。',
  turnstile: '人机验证失败，请重试。',
  rate: '尝试次数过多，请稍后再试。',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const user = await getIdentityService().getCurrentUser();
  if (user) {
    redirect(user.role === 'admin' ? '/admin' : (sp.next?.startsWith('/') ? sp.next : '/favorites'));
  }

  const auth = await getSystemSettingsService().getPublicAuthConfig();

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-12 sm:py-16">
      <div className="mb-8">
        <p className="font-meta mb-2">Account</p>
        <h1 className="section-title text-3xl sm:text-4xl text-ink">登录</h1>
        <p className="mt-2 font-ui text-sm text-soft leading-relaxed">
          使用注册邮箱登录，收藏与观看进度会同步到云端。
        </p>
      </div>

      {sp.ok === 'verify' && (
        <div className="mb-4 rounded-xl border border-[#d8ebda] bg-[#edf7ee] px-4 py-3 font-ui text-sm text-[#346538]">
          注册成功。请查收验证邮件，完成验证后再登录。
        </div>
      )}
      {sp.ok === 'verified' && (
        <div className="mb-4 rounded-xl border border-[#d8ebda] bg-[#edf7ee] px-4 py-3 font-ui text-sm text-[#346538]">
          邮箱已验证，你已登录。
        </div>
      )}
      {sp.error && (
        <div className="mb-4 rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-3 font-ui text-sm text-[#9F2F2D]">
          {ERRORS[sp.error] ?? ERRORS['1']}
        </div>
      )}

      <form action={actionPublicLogin} className="surface-panel p-6 sm:p-7 space-y-4">
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
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="admin-label !mb-0" htmlFor="password">
              密码
            </label>
            <Link
              href="/forgot-password"
              className="font-ui text-[12px] text-soft hover:text-ink"
            >
              忘记密码？
            </Link>
          </div>
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
        {auth.turnstile.onLogin && auth.turnstile.siteKey ? (
          <TurnstileField siteKey={auth.turnstile.siteKey} />
        ) : null}
        <button type="submit" className="btn-ink w-full">
          登录
        </button>
      </form>

      <p className="mt-6 font-ui text-sm text-[#6f6d68] text-center">
        还没有账号？{' '}
        <Link
          href={`/register${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ''}`}
          className="text-ink font-medium underline underline-offset-2 decoration-[#d8d4cb] hover:decoration-[#1a1917]"
        >
          注册
        </Link>
      </p>
    </div>
  );
}
