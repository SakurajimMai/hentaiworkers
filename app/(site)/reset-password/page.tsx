import Link from 'next/link';
import { actionResetPassword } from '../auth/actions';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token : '';

  if (sp.ok === '1') {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:py-16 space-y-5">
        <p className="font-meta">Account</p>
        <h1 className="section-title text-3xl text-ink">密码已更新</h1>
        <p className="font-ui text-sm text-[#6f6d68]">请使用新密码登录。</p>
        <Link href="/login" className="btn-ink inline-flex">
          去登录
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16 space-y-6">
      <div>
        <p className="font-meta mb-2">Account</p>
        <h1 className="section-title text-3xl text-ink">设置新密码</h1>
      </div>

      {sp.error === 'token' && (
        <div className="rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-3 font-ui text-sm text-[#9F2F2D]">
          链接无效或已过期，请重新申请。
        </div>
      )}
      {sp.error === 'password' && (
        <div className="rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-3 font-ui text-sm text-[#9F2F2D]">
          密码至少 8 位，且两次输入须一致。
        </div>
      )}
      {sp.error === '1' && (
        <div className="rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-3 font-ui text-sm text-[#9F2F2D]">
          重置失败，请重试。
        </div>
      )}

      {!token ? (
        <div className="surface-panel p-6 space-y-3">
          <p className="font-ui text-sm text-[#6f6d68]">缺少重置令牌。</p>
          <Link
            href="/forgot-password"
            className="text-ink font-medium underline underline-offset-2 decoration-[#d8d4cb] hover:decoration-[#1a1917] font-ui text-sm"
          >
            重新申请
          </Link>
        </div>
      ) : (
        <form action={actionResetPassword} className="surface-panel p-6 sm:p-7 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="admin-label" htmlFor="password">
              新密码
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
          <div>
            <label className="admin-label" htmlFor="passwordConfirm">
              确认密码
            </label>
            <input
              id="passwordConfirm"
              name="passwordConfirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="admin-input"
            />
          </div>
          <button type="submit" className="btn-ink w-full">
            更新密码
          </button>
        </form>
      )}
    </div>
  );
}
