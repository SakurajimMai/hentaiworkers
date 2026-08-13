import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隐私说明',
  description: 'AnimeStream 如何处理账号、观看进度与收藏数据。',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="page-shell py-12 sm:py-16 pb-20">
      <div className="max-w-2xl">
        <h1 className="section-title text-3xl sm:text-4xl text-ink">隐私说明</h1>
        <p className="mt-3 font-ui text-sm text-soft leading-relaxed">
          这里说明本站在提供浏览与播放服务时，会如何处理与你相关的信息。内容会随功能更新而调整。
        </p>

        <div className="mt-10 space-y-8 font-ui text-[15px] leading-relaxed text-foreground/90">
          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">我们收集什么</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-soft">
              <li>账号：注册时使用的邮箱、可选昵称，以及用于登录的密码（我们不会把密码以可读形式保存）。</li>
              <li>观看：登录后会保存观看进度和收藏；未登录时，进度只留在你正在使用的这台设备上。</li>
              <li>安全：登录、注册和找回密码时，会记录有限次数的尝试，用来防止恶意刷取。</li>
              <li>运行记录：为排查故障，站点会留下必要的访问与错误记录，其中不包含你正在观看的具体内容。</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">我们如何使用</h2>
            <p className="text-soft">
              这些信息只用来帮你登录、在不同设备之间同步进度和收藏、在你需要时发送找回密码的邮件，以及维持站点正常运转。我们不会出售你的账号信息。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">安全验证</h2>
            <p className="text-soft">
              注册或登录时，站点可能会进行人机验证，用来减少机器批量注册和恶意登录。验证过程可能由合作的安全服务协助完成。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">你的选择</h2>
            <p className="text-soft">
              你可以随时退出登录，也可以在历史页清除本机或账号里的观看进度。如果希望删除账号，请联系站点管理员。
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
