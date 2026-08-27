import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getSystemSettingsService } from '@/lib/server/system';
import { isOutboundMailReady } from '@/lib/server/system/domain/settings';
import { actionChangePassword } from '../actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  current: '当前密码不正确。',
  short: '新密码至少 8 位。',
  mismatch: '两次输入的新密码不一致。',
  '1': '修改失败，请重试。',
};

function formatDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default async function AdminAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const view = await getSystemSettingsService().getAdminView();
  const mailReady = isOutboundMailReady(view.smtp);
  const joined = formatDate(admin.createdAt);
  const initial = (admin.displayName || admin.username).slice(0, 1).toUpperCase();

  return (
    <div className="space-y-8 max-w-2xl">
      <header className="admin-page-intro">
        <p className="font-meta mb-2">当前管理员</p>
        <h1 className="section-title text-3xl text-ink sm:text-4xl">账户</h1>
        <p className="mt-2 max-w-xl font-ui text-sm leading-relaxed text-soft">
          查看登录身份并修改密码。改密后当前会话会失效，需要重新登录后台。
        </p>
      </header>

      {sp.error && (
        <div className="notice-error">{ERRORS[sp.error] ?? ERRORS['1']}</div>
      )}

      <section className="surface-panel p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-ui text-[17px] font-semibold tracking-tight text-ink">
              {admin.displayName || admin.username}
            </p>
            <p className="mt-0.5 truncate font-ui text-[13px] text-soft">{admin.username}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="status-pill status-pill-on">管理员</span>
              {joined ? (
                <span className="font-meta normal-case tracking-normal text-[11px]">
                  创建于 {joined}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section
        className={`rounded-xl border px-4 py-3.5 font-ui text-[13px] leading-relaxed ${
          mailReady
            ? 'border-[hsl(var(--success-border))] bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]'
            : 'border-border bg-secondary text-soft'
        }`}
      >
        <p className="font-medium text-ink">
          {mailReady ? '邮件发送已启用' : '邮件发送未启用'}
        </p>
        <p className="mt-1">
          {mailReady
            ? '前台找回密码和邮箱验证会发信。用户只会看到统一提示，不会看到主机或协议细节。'
            : '前台用户看不到原因。找回密码和邮箱验证需要先在系统设置里填好发信配置。'}
        </p>
        <Link
          href="/admin/settings#smtp"
          className="mt-2 inline-flex text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
        >
          打开系统设置
        </Link>
      </section>

      <form action={actionChangePassword} className="surface-card p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-ui text-sm font-semibold text-ink">修改密码</h2>
          <p className="mt-1 font-ui text-[12px] leading-relaxed text-soft">
            新密码至少 8 位。保存成功后会退出，请用新密码重新登录。
          </p>
        </div>
        <div>
          <label className="admin-label" htmlFor="current">
            当前密码
          </label>
          <input
            id="current"
            name="current"
            type="password"
            className="admin-input"
            required
            autoComplete="current-password"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="admin-label" htmlFor="next">
              新密码
            </label>
            <input
              id="next"
              name="next"
              type="password"
              className="admin-input"
              required
              minLength={8}
              autoComplete="new-password"
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
              className="admin-input"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="submit" className="btn-ink">
            更新密码
          </button>
          <Link href="/admin/users" className="btn-ghost !text-[13px]">
            管理其他用户
          </Link>
        </div>
      </form>
    </div>
  );
}
