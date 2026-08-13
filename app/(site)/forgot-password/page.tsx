import Link from 'next/link';
import { actionRequestPasswordReset } from '../auth/actions';

import type { Metadata } from 'next';
import { noIndexMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '找回密码',
  ...noIndexMetadata,
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16 space-y-6">
      <div>
        <p className="font-meta mb-2">Account</p>
        <h1 className="section-title text-3xl text-ink">忘记密码</h1>
        <p className="mt-2 font-ui text-sm text-soft leading-relaxed">
          输入注册邮箱。若账号存在且站点已配置 SMTP，将收到重置链接（60 分钟有效）。
        </p>
      </div>

      {sp.ok === '1' && (
        <div className="notice-success !text-sm">
          若该邮箱已注册，重置邮件已发送（请检查垃圾箱）。
        </div>
      )}
      {sp.error === 'smtp' && (
        <div className="notice-error !text-sm">
          邮件服务未就绪，请联系管理员配置 SMTP。
        </div>
      )}
      {sp.error === 'rate' && (
        <div className="notice-error !text-sm">
          请求过于频繁，请稍后再试。
        </div>
      )}
      {sp.error === '1' && (
        <div className="notice-error !text-sm">
          请求失败，请检查邮箱格式后重试。
        </div>
      )}

      <form action={actionRequestPasswordReset} className="surface-panel p-6 sm:p-7 space-y-4">
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
        <button type="submit" className="btn-ink w-full">
          发送重置链接
        </button>
      </form>

      <p className="font-ui text-sm text-soft text-center">
        <Link href="/login" className="text-ink font-medium underline underline-offset-2 decoration-line hover:decoration-ink">
          返回登录
        </Link>
      </p>
    </div>
  );
}
