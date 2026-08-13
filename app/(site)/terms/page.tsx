import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '使用条款',
  description: 'AnimeStream 服务使用约定与内容说明。',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className="page-shell py-12 sm:py-16 pb-20">
      <div className="max-w-2xl">
        <h1 className="section-title text-3xl sm:text-4xl text-ink">使用条款</h1>
        <p className="mt-3 font-ui text-sm text-soft leading-relaxed">
          使用本站即表示你理解并同意以下约定。若不同意，请停止使用相关服务。
        </p>

        <div className="mt-10 space-y-8 font-ui text-[15px] leading-relaxed text-foreground/90">
          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">服务性质</h2>
            <p className="text-soft">
              AnimeStream 提供在线片库浏览、播放、收藏和观看进度同步。能否顺利播放，取决于作品来源和你当时的网络情况。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">账号责任</h2>
            <p className="text-soft">
              请妥善保管自己的登录信息，不要把账号用于攻击站点、干扰其他用户，或进行其他滥用行为。发现违规时，管理员可以停用相关账号。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">内容与版权</h2>
            <p className="text-soft">
              站内展示的作品信息和播放内容由管理员维护。相关权利归原作者与发行方所有。如果你是权利人，希望处理站内特定内容，请联系站点管理员。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">免责声明</h2>
            <p className="text-soft">
              服务按当前可用状态提供。来源失效、网络异常或合作方暂时不可用时，可能出现无法播放的情况。本站不保证服务始终可用，也不保证特定画质。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="section-title text-xl text-ink">条款变更</h2>
            <p className="text-soft">
              我们可能更新本条款。如有较重要的变更，会尽量在站内提示。继续使用即视为接受更新后的版本。
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
