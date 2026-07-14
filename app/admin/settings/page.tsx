import { getSystemSettingsService } from '@/lib/server/system';
import { requireAdmin } from '@/lib/auth';
import {
  actionSaveSystemSettings,
  actionSendSmtpTest,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminSystemSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const view = await getSystemSettingsService().getAdminView();

  const whitelistText = view.registration.emailWhitelist.join('\n');

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">System</p>
        <h1 className="font-serif text-3xl">系统设置</h1>
        <p className="mt-2 font-ui text-sm text-[#787774] max-w-2xl leading-relaxed">
          配置前台注册策略：邮箱白名单、SMTP、Trust 安全开关与 Cloudflare Turnstile。
          SMTP 密码与 Turnstile Secret 加密存库，表单留空表示不修改。
        </p>
      </div>

      {sp.ok === '1' && (
        <p className="font-meta text-[13px] text-[#137333]">设置已保存</p>
      )}
      {sp.ok === 'smtp' && (
        <p className="font-meta text-[13px] text-[#137333]">测试邮件已发送</p>
      )}
      {sp.error === 'smtp' && (
        <p className="font-meta text-[13px] text-[#C5221F]">SMTP 测试失败，请检查配置</p>
      )}
      {sp.error === '1' && (
        <p className="font-meta text-[13px] text-[#C5221F]">保存失败，请检查必填项</p>
      )}
      {sp.error === 'verify_smtp' && (
        <p className="font-meta text-[13px] text-[#C5221F]">
          开启邮箱验证前须先启用并配置 SMTP
        </p>
      )}

      <form action={actionSaveSystemSettings} className="space-y-6">
        {/* Registration + whitelist */}
        <section className="surface-card p-5 space-y-4">
          <h2 className="font-ui text-sm font-semibold">注册与邮箱白名单</h2>
          <label className="flex items-center gap-2 font-ui text-sm">
            <input
              type="checkbox"
              name="registrationOpen"
              value="1"
              defaultChecked={view.registration.open}
            />
            开放前台注册
          </label>
          <label className="flex items-center gap-2 font-ui text-sm">
            <input
              type="checkbox"
              name="requireEmailVerification"
              value="1"
              defaultChecked={view.registration.requireEmailVerification}
            />
            注册后须邮箱验证（依赖 SMTP）
          </label>
          <label className="block font-meta text-[12px]">
            邮箱白名单（每行一条；空 = 允许任意有效邮箱）
            <textarea
              name="emailWhitelist"
              rows={5}
              className="admin-input mt-1 font-mono text-[12px]"
              defaultValue={whitelistText}
              placeholder={'example.com\n@partner.org\nalice@company.com'}
            />
          </label>
          <p className="font-ui text-[12px] text-[#787774]">
            支持域名（example.com / @example.com）或完整邮箱。子域默认匹配父域规则。
          </p>
        </section>

        {/* SMTP */}
        <section className="surface-card p-5 space-y-4">
          <h2 className="font-ui text-sm font-semibold">SMTP</h2>
          <label className="flex items-center gap-2 font-ui text-sm">
            <input
              type="checkbox"
              name="smtpEnabled"
              value="1"
              defaultChecked={view.smtp.enabled}
            />
            启用 SMTP
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block font-meta text-[12px]">
              主机
              <input
                name="smtpHost"
                className="admin-input mt-1"
                defaultValue={view.smtp.host}
                placeholder="smtp.example.com"
              />
            </label>
            <label className="block font-meta text-[12px]">
              端口
              <input
                name="smtpPort"
                type="number"
                min={1}
                max={65535}
                className="admin-input mt-1"
                defaultValue={view.smtp.port}
              />
            </label>
            <label className="flex items-center gap-2 font-ui text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="smtpSecure"
                value="1"
                defaultChecked={view.smtp.secure}
              />
              使用 TLS（secure，常见 465；关闭则多为 587 + STARTTLS）
            </label>
            <label className="block font-meta text-[12px]">
              用户名
              <input
                name="smtpUsername"
                className="admin-input mt-1"
                defaultValue={view.smtp.username}
                autoComplete="off"
              />
            </label>
            <label className="block font-meta text-[12px]">
              密码{view.smtp.passwordConfigured ? '（已配置，留空不改）' : ''}
              <input
                name="smtpPassword"
                type="password"
                className="admin-input mt-1"
                autoComplete="new-password"
                placeholder={view.smtp.passwordConfigured ? '••••••••' : ''}
              />
            </label>
            <label className="block font-meta text-[12px]">
              发件人邮箱
              <input
                name="smtpFromEmail"
                type="email"
                className="admin-input mt-1"
                defaultValue={view.smtp.fromEmail}
                placeholder="noreply@example.com"
              />
            </label>
            <label className="block font-meta text-[12px]">
              发件人名称
              <input
                name="smtpFromName"
                className="admin-input mt-1"
                defaultValue={view.smtp.fromName}
              />
            </label>
          </div>
        </section>

        {/* Trust */}
        <section className="surface-card p-5 space-y-4">
          <h2 className="font-ui text-sm font-semibold">Trust（安全策略）</h2>
          <p className="font-ui text-[12px] text-[#787774]">
            控制登录/注册是否强制人机验证，以及验证邮件有效期。
          </p>
          <label className="flex items-center gap-2 font-ui text-sm">
            <input
              type="checkbox"
              name="turnstileOnRegister"
              value="1"
              defaultChecked={view.trust.turnstileOnRegister}
            />
            注册需要 Turnstile
          </label>
          <label className="flex items-center gap-2 font-ui text-sm">
            <input
              type="checkbox"
              name="turnstileOnLogin"
              value="1"
              defaultChecked={view.trust.turnstileOnLogin}
            />
            登录需要 Turnstile
          </label>
          <label className="block font-meta text-[12px] max-w-xs">
            邮箱验证链接有效期（分钟）
            <input
              name="verificationTokenTtlMinutes"
              type="number"
              min={5}
              max={10080}
              className="admin-input mt-1"
              defaultValue={view.trust.verificationTokenTtlMinutes}
            />
          </label>
        </section>

        {/* Turnstile */}
        <section className="surface-card p-5 space-y-4">
          <h2 className="font-ui text-sm font-semibold">Cloudflare Turnstile</h2>
          <label className="flex items-center gap-2 font-ui text-sm">
            <input
              type="checkbox"
              name="turnstileEnabled"
              value="1"
              defaultChecked={view.turnstile.enabled}
            />
            启用 Turnstile
          </label>
          <label className="block font-meta text-[12px]">
            Site Key（公开）
            <input
              name="turnstileSiteKey"
              className="admin-input mt-1 font-mono text-[12px]"
              defaultValue={view.turnstile.siteKey}
              autoComplete="off"
            />
          </label>
          <label className="block font-meta text-[12px]">
            Secret Key{view.turnstile.secretConfigured ? '（已配置，留空不改）' : ''}
            <input
              name="turnstileSecretKey"
              type="password"
              className="admin-input mt-1 font-mono text-[12px]"
              autoComplete="new-password"
              placeholder={view.turnstile.secretConfigured ? '••••••••' : ''}
            />
          </label>
          <p className="font-ui text-[12px] text-[#787774]">
            在 Cloudflare Dashboard → Turnstile 创建站点密钥对。启用且 Trust 开关打开后，前台表单会加载挑战组件。
          </p>
        </section>

        <button type="submit" className="btn-ink">
          保存全部设置
        </button>
      </form>

      <form action={actionSendSmtpTest} className="surface-card p-5 space-y-3 max-w-lg">
        <h2 className="font-ui text-sm font-semibold">发送 SMTP 测试邮件</h2>
        <label className="block font-meta text-[12px]">
          收件邮箱
          <input
            name="to"
            type="email"
            required
            className="admin-input mt-1"
            placeholder="you@example.com"
          />
        </label>
        <button type="submit" className="btn-ghost">
          发送测试
        </button>
      </form>
    </div>
  );
}
