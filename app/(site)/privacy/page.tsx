import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隐私说明 · AnimeStream',
  description: 'AnimeStream 如何处理账号、观看进度与日志数据。',
};

export default function PrivacyPage() {
  return (
    <div className="page-shell py-12 sm:py-16 pb-20">
      <div className="max-w-2xl">
        <p className="font-meta mb-3">Legal</p>
        <h1 className="section-title text-3xl sm:text-4xl text-ink">隐私说明</h1>
        <p className="mt-3 font-ui text-sm text-soft leading-relaxed">
          本文说明本站在提供浏览与播放服务时如何处理与你相关的数据。内容会随功能更新而调整。
        </p>

        <div className="mt-10 space-y-8 font-ui text-[15px] leading-relaxed text-[#3a3834]">
          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">我们收集什么</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-soft">
              <li>账号：注册邮箱、可选昵称、密码哈希（不明文存密码）。</li>
              <li>观看：登录后的观看进度与片单；未登录时进度仅保存在你的浏览器本地。</li>
              <li>安全：登录 / 注册 / 重置密码的有限次尝试记录，用于防滥用。</li>
              <li>运营日志：服务端访问与错误日志，用于排障，不含播放内容本身。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">我们如何使用</h2>
            <p className="text-soft">
              数据仅用于登录鉴权、跨设备同步进度与片单、发送密码重置邮件（若管理员启用 SMTP），以及保障服务稳定。不会出售个人账号信息。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">第三方</h2>
            <p className="text-soft">
              若管理员启用 Cloudflare Turnstile，注册或登录时会与 Turnstile 服务交互以完成人机验证。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">你的选择</h2>
            <p className="text-soft">
              可随时退出登录；可在历史页清除本机或账号进度。如需删除账号，请联系站点管理员处理。
            </p>
          </section>
        </div>

        <div className="mt-12 flex flex-wrap gap-2">
          <Link href="/" className="btn-ghost !text-[13px]">
            返回首页
          </Link>
          <Link href="/terms" className="btn-ghost !text-[13px]">
            使用条款
          </Link>
        </div>
      </div>
    </div>
  );
}
