import { getSystemSettingsService } from '@/lib/server/system';
import { requireAdmin } from '@/lib/auth';
import { AdminMangaPublishSecret } from '@/components/admin-manga-publish-secret';
import { AdsFeedSlotsEditor } from '@/components/admin/ads-feed-slots-editor';
import { HeroSlidesEditor } from '@/components/admin/hero-slides-editor';
import { effectiveHeroSlides } from '@/lib/server/system/domain/settings';
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
        <p className="mt-2 font-ui text-sm text-soft max-w-2xl leading-relaxed">
          配置前台注册策略、首页幻灯片、页脚（App 下载 / Telegram 频道）、播放器（里番 ArtPlayer 广告/右键）、信息流/漫画阅读广告、SMTP、Trust、Cloudflare Turnstile，以及漫画发布密钥。
          SMTP / Turnstile / 漫画发布密钥加密存库，表单留空表示不修改。
        </p>
      </div>

      <nav className="admin-section-nav sticky top-[4.5rem] z-20 -mx-1 bg-background/95 px-1 py-2 backdrop-blur" aria-label="系统设置分区">
        <a href="#registration">注册</a>
        <a href="#hero">幻灯片</a>
        <a href="#app">页脚</a>
        <a href="#smtp">SMTP</a>
        <a href="#trust">安全验证</a>
        <a href="#player">播放器</a>
        <a href="#ads">广告</a>
        <a href="#manga">漫画发布</a>
        <a href="#turnstile">Turnstile</a>
      </nav>

      {sp.ok === '1' && (
        <p className="font-meta text-[13px] text-[hsl(var(--success))]">设置已保存</p>
      )}
      {sp.ok === 'smtp' && (
        <p className="font-meta text-[13px] text-[hsl(var(--success))]">测试邮件已发送</p>
      )}
      {sp.error === 'smtp' && (
        <p className="font-meta text-[13px] text-danger">SMTP 测试失败，请检查配置</p>
      )}
      {sp.error === '1' && (
        <p className="font-meta text-[13px] text-danger">保存失败，请检查必填项</p>
      )}
      {sp.error === 'verify_smtp' && (
        <p className="font-meta text-[13px] text-danger">
          开启邮箱验证前须先启用并配置 SMTP
        </p>
      )}

      <form action={actionSaveSystemSettings} className="space-y-6">
        {/* Registration + whitelist */}
        <section id="registration" className="surface-card scroll-mt-24 p-5 space-y-4">
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
          <p className="font-ui text-[12px] text-soft">
            支持域名（example.com / @example.com）或完整邮箱。子域默认匹配父域规则。
          </p>
        </section>

        <section id="hero" className="surface-card scroll-mt-24 p-5 space-y-4">
          <h2 className="font-ui text-sm font-semibold">首页幻灯片</h2>
          <p className="font-ui text-[12px] text-soft leading-relaxed">
            按顺序展示，可混排「里番作品」与「自定义」幻灯片（最多 20 张，不再限于 3 张）。
            作品幻灯片默认用作品海报和播放链接，可用自定义封面覆盖；
            自定义幻灯片需要填写标题和封面图，可配置任意跳转链接。全部留空时自动展示最近更新的作品。
          </p>
          <HeroSlidesEditor
            initialSlides={effectiveHeroSlides(view.hero).map((slide) => ({
              kind: slide.kind,
              animeId: slide.animeId,
              title: slide.title,
              imageUrl: slide.imageUrl,
              linkUrl: slide.linkUrl,
              description: slide.description,
            }))}
          />
          <label className="block font-meta text-[12px] max-w-xs">
            自动切换间隔（秒）
            <input
              name="heroIntervalSeconds"
              type="number"
              min={2}
              max={60}
              className="admin-input mt-1"
              defaultValue={view.hero.intervalSeconds}
            />
          </label>
        </section>

        <section id="app" className="surface-card scroll-mt-24 p-5 space-y-4">
          <h2 className="font-ui text-sm font-semibold">页脚链接</h2>
          <p className="font-ui text-[12px] text-soft leading-relaxed">
            填入后会显示在前台页脚。下载地址出现在「浏览」栏，Telegram 频道出现在「社区」栏。留空则不显示。
          </p>
          <label className="block font-meta text-[12px]">
            下载地址
            <input
              name="androidDownloadUrl"
              className="admin-input mt-1 font-mono text-[12px]"
              defaultValue={view.site.androidDownloadUrl}
              placeholder="https://example.com/animestream.apk"
            />
          </label>
          <label className="block font-meta text-[12px] max-w-xs">
            下载链接文字
            <input
              name="androidDownloadLabel"
              className="admin-input mt-1"
              defaultValue={view.site.androidDownloadLabel}
              placeholder="下载 App"
              maxLength={40}
            />
          </label>
          <label className="block font-meta text-[12px]">
            Telegram 频道
            <input
              name="telegramUrl"
              className="admin-input mt-1 font-mono text-[12px]"
              defaultValue={view.site.telegramUrl}
              placeholder="@channel 或 https://t.me/channel"
            />
          </label>
          <label className="block font-meta text-[12px] max-w-xs">
            Telegram 链接文字
            <input
              name="telegramLabel"
              className="admin-input mt-1"
              defaultValue={view.site.telegramLabel}
              placeholder="Telegram"
              maxLength={40}
            />
          </label>
        </section>

        {/* SMTP */}
        <section id="smtp" className="surface-card scroll-mt-24 p-5 space-y-4">
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
        <section id="trust" className="surface-card scroll-mt-24 p-5 space-y-4">
          <h2 className="font-ui text-sm font-semibold">Trust（安全策略）</h2>
          <p className="font-ui text-[12px] text-soft">
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
        <section id="player" className="surface-card scroll-mt-24 p-5 space-y-4">
          <h2 className="font-ui text-sm font-semibold">播放器（ArtPlayer）</h2>
          <p className="font-ui text-[12px] text-soft leading-relaxed">
            里番页使用本站 ArtPlayer 播放托管 MP4。
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

          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="font-ui text-[13px] font-semibold">片头广告（视频 / 图片）</h3>
            <p className="font-ui text-[12px] text-soft leading-relaxed">
              展示优先级：视频 → 自定义 HTML → 图片。用于里番 ArtPlayer。
              「可关闭前秒数」内不能跳过；到总时长后自动进入正片。
              仅勾选启用但未填写视频/HTML/图片时，用户不会看到广告。
              可关闭前秒数填 0 时，插件仍约有 1 秒后才显示关闭按钮。
              网站（含手机浏览器）和 Android App 使用同一套片头 / 暂停广告。
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

          <div className="border-t border-border pt-4 space-y-3">
            <h3 className="font-ui text-[13px] font-semibold">暂停广告</h3>
            <p className="font-ui text-[12px] text-soft leading-relaxed">
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

        </section>

        <section id="ads" className="surface-card scroll-mt-24 p-5 space-y-5">
          <div>
            <h2 className="font-ui text-sm font-semibold">广告位</h2>
            <p className="mt-1 font-ui text-[12px] text-soft leading-relaxed">
              信息流可配置多条广告，每条单独开关、单独设置「每隔 x 张卡片」。
              阅读页只在章节顶部和底部放广告，不会插入到漫画页中间。
              这里保存后，网站（含手机浏览器）和 Android App 会使用同一套广告。
              阅读页 HTML 可以直接粘贴联盟脚本（含 document.write、async src）。
            </p>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="font-ui text-[13px] font-semibold">信息流原生卡</h3>
            <AdsFeedSlotsEditor initialSlots={[...view.ads.feedSlots]} />
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <h3 className="font-ui text-[13px] font-semibold">漫画阅读页</h3>

            <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-3.5">
              <label className="field-check text-sm">
                <input
                  type="checkbox"
                  name="adsReaderTopEnabled"
                  value="1"
                  defaultChecked={view.ads.reader.top.enabled}
                />
                章节阅读顶部广告
              </label>
              <label className="block font-meta text-[12px]">
                HTML
                <textarea
                  name="adsReaderTopHtml"
                  rows={8}
                  className="admin-input mt-1 font-mono text-[12px]"
                  defaultValue={view.ads.reader.top.html}
                  placeholder={'<script>/* 联盟广告代码 */</script>'}
                />
              </label>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-3.5">
              <label className="field-check text-sm">
                <input
                  type="checkbox"
                  name="adsReaderBottomEnabled"
                  value="1"
                  defaultChecked={view.ads.reader.bottom.enabled}
                />
                章节阅读底部广告
              </label>
              <label className="block font-meta text-[12px]">
                HTML
                <textarea
                  name="adsReaderBottomHtml"
                  rows={8}
                  className="admin-input mt-1 font-mono text-[12px]"
                  defaultValue={view.ads.reader.bottom.html}
                  placeholder={'<script>/* 联盟广告代码 */</script>'}
                />
              </label>
            </div>
          </div>
        </section>

        {/* Manga publish */}
        <section id="manga" className="surface-card scroll-mt-24 p-5 space-y-4">
          <h2 className="font-ui text-sm font-semibold">漫画发布（TG → 图床 → 本站）</h2>
          <p className="font-ui text-[12px] text-soft leading-relaxed">
            无需在 Docker / .env 配置漫画 API。在此设置一个发布密钥后，外部{' '}
            <code className="text-foreground">tg-manga</code> 服务使用相同密钥调用{' '}
            <code className="text-foreground">POST /api/manga/publish</code> 即可入库并上架前台{' '}
            <code className="text-foreground">/manga</code>。
          </p>
          <label className="flex items-center gap-2 font-ui text-sm">
            <input
              type="checkbox"
              name="mangaEnabled"
              value="1"
              defaultChecked={view.manga.enabled}
            />
            启用漫画栏目与发布接口
          </label>
          <AdminMangaPublishSecret configured={view.manga.publishSecretConfigured} />
          <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 font-ui text-[12px] text-soft space-y-1">
            <p>Worker 侧示例环境变量（仅 tg-manga 需要）：</p>
            <pre className="overflow-x-auto font-mono text-[11px] text-foreground whitespace-pre-wrap">{`SITE_PUBLISH_URL=https://你的站点/api/manga/publish
SITE_PUBLISH_SECRET=与上方相同的密钥`}</pre>
            <p>
              请求头：<code className="text-foreground">X-Manga-Publish-Key: &lt;密钥&gt;</code>
              {' '}或 <code className="text-foreground">Authorization: Bearer &lt;密钥&gt;</code>
            </p>
          </div>
        </section>

        {/* Turnstile */}
        <section id="turnstile" className="surface-card scroll-mt-24 p-5 space-y-4">
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
          <p className="font-ui text-[12px] text-soft">
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
