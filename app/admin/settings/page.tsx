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
          配置前台注册策略、播放器（里番 ArtPlayer 广告/右键、动漫线路解析器）、SMTP、Trust 与 Cloudflare Turnstile。
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

        {/* Player */}
        <section className="surface-card p-5 space-y-4">
          <h2 className="font-ui text-sm font-semibold">播放器（ArtPlayer / 线路解析）</h2>
          <p className="font-ui text-[12px] text-[#787774] leading-relaxed">
            <strong>里番</strong>页固定使用本站 ArtPlayer（MP4）。
            <strong>动漫</strong>页按线路匹配「解析播放器」iframe；未匹配时可回退 ArtPlayer+代理。
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 font-ui text-sm">
              <input
                type="checkbox"
                name="playerEnableContextMenu"
                value="1"
                defaultChecked={view.player.enableContextMenu}
              />
              允许播放器右键菜单
            </label>
            <label className="flex items-center gap-2 font-ui text-sm">
              <input
                type="checkbox"
                name="playerWorksFallbackArtPlayer"
                value="1"
                defaultChecked={view.player.worksFallbackArtPlayer}
              />
              动漫未匹配解析器时回退 ArtPlayer
            </label>
            <label className="block font-meta text-[12px]">
              主题色
              <input
                name="playerTheme"
                className="admin-input mt-1 font-mono text-[12px]"
                defaultValue={view.player.theme}
                placeholder="#E53935"
              />
            </label>
          </div>

          <div className="border-t border-[#EAEAEA] pt-4 space-y-3">
            <h3 className="font-ui text-[13px] font-semibold">片头广告（视频 / 图片）</h3>
            <p className="font-ui text-[12px] text-[#6f6d68] leading-relaxed">
              展示优先级：视频 → 自定义 HTML → 图片。用于里番 ArtPlayer 与动漫 ArtPlayer 回退。
              「可关闭前秒数」内不能跳过；到总时长后自动进入正片。
              仅勾选启用但未填写视频/HTML/图片时，用户不会看到广告。
              可关闭前秒数填 0 时，插件仍约有 1 秒后才显示关闭按钮。
            </p>
            <label className="field-check text-sm">
              <input
                type="checkbox"
                name="playerPreRollEnabled"
                value="1"
                defaultChecked={view.player.preRollAd.enabled}
              />
              启用片头广告
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block font-meta text-[12px] sm:col-span-2">
                视频广告 URL（优先）
                <input
                  name="playerPreRollVideoUrl"
                  className="admin-input mt-1"
                  defaultValue={view.player.preRollAd.videoUrl}
                  placeholder="https://cdn.example/ad.mp4"
                />
              </label>
              <label className="block font-meta text-[12px] sm:col-span-2">
                图片广告 URL
                <input
                  name="playerPreRollImageUrl"
                  className="admin-input mt-1"
                  defaultValue={view.player.preRollAd.imageUrl}
                  placeholder="https://cdn.example/ad.jpg"
                />
              </label>
              <label className="block font-meta text-[12px] sm:col-span-2">
                自定义 HTML（无视频时优先于图片）
                <textarea
                  name="playerPreRollHtml"
                  rows={2}
                  className="admin-input mt-1 font-mono text-[12px]"
                  defaultValue={view.player.preRollAd.html}
                  placeholder={'<div style="color:#fff">广告文案</div>'}
                />
              </label>
              <label className="block font-meta text-[12px]">
                点击跳转 URL
                <input
                  name="playerPreRollClickUrl"
                  className="admin-input mt-1"
                  defaultValue={view.player.preRollAd.clickUrl}
                  placeholder="https://example.com/landing"
                />
              </label>
              <label className="field-check text-sm self-end pb-2">
                <input
                  type="checkbox"
                  name="playerPreRollMuted"
                  value="1"
                  defaultChecked={view.player.preRollAd.muted}
                />
                视频广告默认静音
              </label>
              <label className="block font-meta text-[12px]">
                可关闭前秒数
                <input
                  name="playerPreRollPlayDuration"
                  type="number"
                  min={0}
                  max={120}
                  className="admin-input mt-1"
                  defaultValue={view.player.preRollAd.playDuration}
                />
              </label>
              <label className="block font-meta text-[12px]">
                总时长（秒）
                <input
                  name="playerPreRollTotalDuration"
                  type="number"
                  min={0}
                  max={180}
                  className="admin-input mt-1"
                  defaultValue={view.player.preRollAd.totalDuration}
                />
              </label>
            </div>
          </div>

          <div className="border-t border-[#EAEAEA] pt-4 space-y-3">
            <h3 className="font-ui text-[13px] font-semibold">暂停广告</h3>
            <p className="font-ui text-[12px] text-[#6f6d68] leading-relaxed">
              用户暂停正片后覆盖一层广告。展示优先级：视频 → 自定义 HTML → 图片。
              片头广告播放期间不会弹出暂停广告。
              仅勾选启用但未填写视频/HTML/图片时，用户不会看到广告。
            </p>
            <label className="field-check text-sm">
              <input
                type="checkbox"
                name="playerPauseAdEnabled"
                value="1"
                defaultChecked={view.player.pauseAd.enabled}
              />
              启用暂停广告
            </label>
            <label className="block font-meta text-[12px]">
              视频 URL（优先）
              <input
                name="playerPauseAdVideoUrl"
                className="admin-input mt-1"
                defaultValue={view.player.pauseAd.videoUrl}
                placeholder="https://cdn.example/pause-ad.mp4"
              />
            </label>
            <label className="block font-meta text-[12px]">
              图片 URL
              <input
                name="playerPauseAdImageUrl"
                className="admin-input mt-1"
                defaultValue={view.player.pauseAd.imageUrl}
                placeholder="https://cdn.example/pause-ad.jpg"
              />
            </label>
            <label className="block font-meta text-[12px]">
              自定义 HTML
              <textarea
                name="playerPauseAdHtml"
                rows={2}
                className="admin-input mt-1 font-mono text-[12px]"
                defaultValue={view.player.pauseAd.html}
              />
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block font-meta text-[12px]">
                点击跳转 URL
                <input
                  name="playerPauseAdClickUrl"
                  className="admin-input mt-1"
                  defaultValue={view.player.pauseAd.clickUrl}
                />
              </label>
              <label className="field-check text-sm self-end pb-2">
                <input
                  type="checkbox"
                  name="playerPauseAdMuted"
                  value="1"
                  defaultChecked={view.player.pauseAd.muted}
                />
                暂停视频广告静音
              </label>
            </div>
          </div>

          <div className="border-t border-[#EAEAEA] pt-4 space-y-3">
            <h3 className="font-ui text-[13px] font-semibold">动漫线路 → 解析播放器</h3>
            <p className="font-ui text-[12px] text-[#787774] leading-relaxed">
              每行一条：<code className="font-mono">匹配关键字|解析地址</code>。
              匹配线路 <code className="font-mono">flag</code> 或名称（包含即可，如 <code className="font-mono">hnm3u8</code> / <code className="font-mono">红牛</code>）。
              解析地址示例：<code className="font-mono">https://www.hnjiexi.com/m3u8/?url=</code>
              （分集 m3u8 会拼到后面）。行尾加 <code className="font-mono">|0</code> 可禁用。
            </p>
            <textarea
              name="playerLineParsers"
              rows={6}
              className="admin-input font-mono text-[12px]"
              defaultValue={view.player.lineParsers
                .map((p) => `${p.match}|${p.parserUrl}${p.enabled ? '' : '|0'}`)
                .join('\n')}
              placeholder={'hnm3u8|https://www.hnjiexi.com/m3u8/?url=\n红牛|https://www.hnjiexi.com/m3u8/?url='}
            />
          </div>
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
