import Link from 'next/link';
import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/seo';
import { normalizePublicNext } from '@/lib/server/shared/auth-navigation';
import { actionResendVerification, actionVerifyEmail } from '../auth/actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '验证邮箱', ...noIndexMetadata };

export default async function VerifyEmailPage({ searchParams }: {
  searchParams: Promise<{ token?: string; email?: string; next?: string; error?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const email = typeof sp.email === 'string' ? sp.email : '';
  const token = typeof sp.token === 'string' ? sp.token : '';
  const next = normalizePublicNext(sp.next, '/favorites');
  return (
    <div className="mx-auto max-w-md px-4 py-16 space-y-5">
      <h1 className="section-title text-3xl">验证邮箱</h1>
      <p className="font-ui text-sm text-soft">输入注册邮箱收到的六位验证码，验证通过后账号才会激活。验证码最多十分钟内有效。</p>
      {sp.error && <p className="notice-error">{sp.error === 'rate' ? '尝试次数过多，请稍后再试。' : sp.error === 'send' ? '邮件发送失败，请稍后重新发送。' : '验证码无效、已使用或已过期，请检查邮箱或重新发送。'}</p>}
      {sp.ok === 'sent' && <p className="notice-success">若该邮箱有待验证的注册申请，新的验证码已发送，请检查收件箱和垃圾邮件。</p>}
      <form action={actionVerifyEmail} className="surface-panel p-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        {token ? <input type="hidden" name="token" value={token} /> : <>
          <label className="admin-label">注册邮箱
            <input name="email" type="email" defaultValue={email} maxLength={64} required autoComplete="email" className="admin-input mt-1" />
          </label>
          <label className="admin-label">邮箱验证码
            <input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="one-time-code" className="admin-input mt-1" />
          </label>
        </>}
        <button type="submit" className="btn-ink w-full">验证并完成注册</button>
      </form>
      <form action={actionResendVerification} className="surface-panel p-6 space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="admin-label">没收到邮件？填写注册邮箱后重新发送
          <input name="email" type="email" defaultValue={email} required maxLength={64} autoComplete="email" className="admin-input mt-1" />
        </label>
        <button type="submit" className="btn-ghost">重新发送验证码</button>
      </form>
      <p className="font-ui text-sm"><Link href="/register" className="text-accent">返回注册</Link> · <Link href="/login" className="text-accent">去登录</Link></p>
    </div>
  );
}
