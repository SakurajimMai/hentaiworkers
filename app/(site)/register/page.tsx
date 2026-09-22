import { VerificationResendButton } from '@/components/verification-resend-button';
import { ValidatedForm } from '@/components/validated-form';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TurnstileField } from '@/components/turnstile-field';
import { getIdentityService } from '@/lib/server/identity';
import { getSystemSettingsService } from '@/lib/server/system';
import {
  buildPublicLoginHref,
  normalizePublicNext,
} from '@/lib/server/shared/auth-navigation';
import {
  actionPublicRegister,
  actionResendVerification,
  actionVerifyEmail,
} from '../auth/actions';

import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '注册',
  ...noIndexMetadata,
};

const ERRORS: Record<string, string> = {
  exists: '该邮箱已注册，请直接登录。',
  email: '请输入有效邮箱地址。',
  password: '密码至少 8 位。',
  whitelist: '不支持使用该邮箱注册，请更换其他邮箱。',
  closed: '当前未开放注册。',
  turnstile: '人机验证失败，请重试。',
  rate: '尝试次数过多，请稍后再试。',
  code: '验证码无效、已使用或已过期，请重新发送。',
  send: '验证邮件发送失败，请稍后重新发送。',
  '1': '注册失败，请稍后重试。',
};

type AuthSearchValue = string | readonly string[] | undefined;

function firstValue(value: AuthSearchValue): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

/**
 * The address awaiting a code. Its presence is what switches the page to the code step, so a
 * value that cannot be an address leaves the visitor on the registration form.
 */
function pendingEmail(value: string | undefined): string {
  const email = (value ?? '').trim().toLowerCase().slice(0, 64);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: AuthSearchValue;
    next?: AuthSearchValue;
    email?: AuthSearchValue;
    ok?: AuthSearchValue;
  }>;
}) {
  const sp = await searchParams;
  const error = firstValue(sp.error);
  const next = normalizePublicNext(sp.next, '/favorites');
  const awaitingCode = pendingEmail(firstValue(sp.email));
  const user = await getIdentityService().getCurrentUser();
  if (user) {
    redirect(user.role === 'admin' ? '/admin' : next);
  }

  const service = getSystemSettingsService();
  const auth = await service.getPublicAuthConfig();
  const retryAfter = await service.verificationRetryAfter(awaitingCode);

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-12 sm:py-16">
      <div className="mb-8">
        <p className="font-meta mb-2">Account</p>
        <h1 className="section-title text-3xl sm:text-4xl text-ink">注册</h1>
        <p className="mt-2 font-ui text-sm text-soft leading-relaxed">
          创建账号后，收藏与观看进度会同步到云端。
        </p>
      </div>

      {error && (
        <div className="mb-4 notice-error !text-sm">
          {ERRORS[error] ?? ERRORS['1']}
        </div>
      )}
      {firstValue(sp.ok) === 'sent' && (
        <div className="mb-4 notice-success !text-sm">
          新的验证码已发送，请查收收件箱和垃圾邮件。
        </div>
      )}

      {awaitingCode ? (
        // Only a pending request exists. The server creates the user after accepting the code.
        <>
          <ValidatedForm action={actionVerifyEmail} className="surface-panel p-6 sm:p-7 space-y-4">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="from" value="/register" />
            <input type="hidden" name="email" value={awaitingCode} />
            <div>
              <label className="admin-label" htmlFor="code">
                邮箱验证码 *
              </label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                autoComplete="one-time-code"
                className="admin-input"
                placeholder="六位数字"
              />
              <p className="mt-2 font-ui text-[12px] leading-relaxed text-soft">
                {error === 'send' ? `验证码未能发送至 ${awaitingCode}，请等待倒计时结束后重试。` : `验证码已发送至 ${awaitingCode}，十分钟内有效；验证通过后才会创建账号，完成注册。`}
              </p>
            </div>
            <button type="submit" className="btn-ink w-full">
              完成注册
            </button>
          </ValidatedForm>

          <form action={actionResendVerification} className="mt-4 text-center">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="from" value="/register" />
            <input type="hidden" name="email" value={awaitingCode} />
            <VerificationResendButton retryAt={Date.now() + retryAfter * 1000} initialSeconds={retryAfter} />
          </form>
        </>
      ) : !auth.registrationOpen ? (
        <div className="surface-panel p-6 space-y-4">
          <p className="font-ui text-sm text-soft">当前未开放注册，请联系管理员。</p>
          <Link href={buildPublicLoginHref(next)} className="btn-ink inline-flex">
            去登录
          </Link>
        </div>
      ) : (
        <ValidatedForm action={actionPublicRegister} className="surface-panel p-6 sm:p-7 space-y-4">
          <input type="hidden" name="next" value={next} />
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
            发送验证码
          </button>
        </ValidatedForm>
      )}

      <p className="mt-6 font-ui text-sm text-soft text-center">
        已有账号？{' '}
        <Link
          href={buildPublicLoginHref(next)}
          className="text-ink font-medium underline underline-offset-2 decoration-line hover:decoration-ink"
        >
          登录
        </Link>
      </p>
    </div>
  );
}
