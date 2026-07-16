import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TurnstileField } from '@/components/turnstile-field';
import { getIdentityService } from '@/lib/server/identity';
import { getSystemSettingsService } from '@/lib/server/system';
import { actionPublicRegister } from '../auth/actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  exists: '该邮箱已注册，请直接登录。',
  email: '请输入有效邮箱地址。',
  password: '密码至少 8 位。',
  whitelist: '该邮箱不在允许注册的白名单中。',
  closed: '当前未开放注册。',
  turnstile: '人机验证失败，请重试。',
  rate: '尝试次数过多，请稍后再试。',
  '1': '注册失败，请稍后重试。',
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
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
        <h1 className="section-title text-3xl sm:text-4xl text-ink">注册</h1>
        <p className="mt-2 font-ui text-sm text-[#6f6d68] leading-relaxed">
          用邮箱创建账号
          {auth.requireEmailVerification ? '；提交后请查收验证邮件' : '，登录后可跨设备同步收藏'}
          {auth.emailWhitelistEnabled ? '（仅白名单邮箱）' : ''}
          。
        </p>
      </div>

      {!auth.registrationOpen ? (
        <div className="surface-panel p-6 space-y-4">
          <p className="font-ui text-sm text-[#6f6d68]">当前未开放注册，请联系管理员。</p>
          <Link href="/login" className="btn-ink inline-flex">
            去登录
          </Link>
        </div>
      ) : (
        <>
          {sp.error && (
            <div className="mb-4 rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-3 font-ui text-sm text-[#9F2F2D]">
              {ERRORS[sp.error] ?? ERRORS['1']}
            </div>
          )}

          <form action={actionPublicRegister} className="surface-panel p-6 sm:p-7 space-y-4">
            <input type="hidden" name="next" value={sp.next || '/favorites'} />
            <div>
              <label className="admin-label" htmlFor="email">
                邮箱 *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                maxLength={64}
                autoComplete="email"
                className="admin-input"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="admin-label" htmlFor="displayName">
                昵称（可选）
              </label>
              <input
                id="displayName"
                name="displayName"
                maxLength={64}
                autoComplete="nickname"
                className="admin-input"
                placeholder="显示名称"
              />
            </div>
            <div>
              <label className="admin-label" htmlFor="password">
                密码 *（至少 8 位）
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="admin-input"
              />
            </div>
            {auth.turnstile.onRegister && auth.turnstile.siteKey ? (
              <TurnstileField siteKey={auth.turnstile.siteKey} />
            ) : null}
            <button type="submit" className="btn-ink w-full">
              创建账号
            </button>
          </form>
        </>
      )}

      <p className="mt-6 font-ui text-sm text-[#6f6d68] text-center">
        已有账号？{' '}
        <Link
          href={`/login${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ''}`}
          className="text-ink font-medium underline underline-offset-2 decoration-[#d8d4cb] hover:decoration-[#1a1917]"
        >
          登录
        </Link>
      </p>
    </div>
  );
}
