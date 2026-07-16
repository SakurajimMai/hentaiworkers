import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '使用条款 · AnimeStream',
  description: 'AnimeStream 服务使用约定与内容说明。',
};

export default function TermsPage() {
  return (
    <div className="page-shell py-12 sm:py-16 pb-20">
      <div className="max-w-2xl">
        <p className="font-meta mb-3">Legal</p>
        <h1 className="section-title text-3xl sm:text-4xl text-ink">使用条款</h1>
        <p className="mt-3 font-ui text-sm text-soft leading-relaxed">
          使用本站即表示你理解并同意以下约定。若不同意，请停止使用相关服务。
        </p>

        <div className="mt-10 space-y-8 font-ui text-[15px] leading-relaxed text-[#3a3834]">
          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">服务性质</h2>
            <p className="text-soft">
              AnimeStream 提供在线片库浏览、播放与账号相关功能（片单、进度同步等）。部分动漫内容为外链播放，可用性取决于源站与网络环境。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">账号责任</h2>
            <p className="text-soft">
              你应妥善保管登录凭据，不得将账号用于攻击、滥用接口或干扰其他用户。管理员可在发现违规时停用账号。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">内容与版权</h2>
            <p className="text-soft">
              站内展示的作品元数据与媒体链接可能来自采集配置或管理员录入。权利归属原作者与发行方。若你是权利人并希望处理特定内容，请联系站点管理员。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">免责声明</h2>
            <p className="text-soft">
              服务按「现状」提供。外链失效、证书错误、第三方解析不可用等情况可能导致无法播放，站点不保证持续可用性与特定画质。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">条款变更</h2>
            <p className="text-soft">
              我们可能更新本条款。重大变更会尽量在站内提示；继续使用即视为接受更新后的版本。
            </p>
          </section>
        </div>

        <div className="mt-12 flex flex-wrap gap-2">
          <Link href="/" className="btn-ghost !text-[13px]">
            返回首页
          </Link>
          <Link href="/privacy" className="btn-ghost !text-[13px]">
            隐私说明
          </Link>
        </div>
      </div>
    </div>
  );
}
