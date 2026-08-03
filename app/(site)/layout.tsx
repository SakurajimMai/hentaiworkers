import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { WatchProgressMergeOnLogin } from '@/components/watch-progress-merge';
import { getIdentityService } from '@/lib/server/identity';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getIdentityService().getCurrentUser();

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      <SiteHeader />
      <WatchProgressMergeOnLogin enabled={!!user} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <footer className="mt-auto border-t border-[#e8e4dc] bg-[#f3f1ec]/55">
        <div className="page-shell py-12 sm:py-14 flex flex-col gap-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-8">
            <div className="max-w-sm">
              <p className="font-ui text-[15px] font-semibold tracking-tight text-ink">
                AnimeStream
              </p>
              <p className="mt-2 font-ui text-[13px] leading-relaxed text-soft">
                里番片库 · 托管 MP4 在线观看，进度与片单同步。
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-10 gap-y-6 font-ui text-[13px]">
              <div>
                <p className="font-meta mb-2.5">浏览</p>
                <ul className="space-y-1.5 text-soft">
                  <li>
                    <Link href="/browse" className="hover:text-ink transition-colors">
                      里番
                    </Link>
                  </li>
                  <li>
                    <Link href="/history" className="hover:text-ink transition-colors">
                      历史
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-meta mb-2.5">账号</p>
                <ul className="space-y-1.5 text-soft">
                  <li>
                    <Link href="/favorites" className="hover:text-ink transition-colors">
                      片单
                    </Link>
                  </li>
                  <li>
                    <Link href="/login" className="hover:text-ink transition-colors">
                      登录
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="hover:text-ink transition-colors">
                      注册
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-meta mb-2.5">关于</p>
                <ul className="space-y-1.5 text-soft">
                  <li>
                    <Link href="/privacy" className="hover:text-ink transition-colors">
                      隐私说明
                    </Link>
                  </li>
                  <li>
                    <Link href="/terms" className="hover:text-ink transition-colors">
                      使用条款
                    </Link>
                  </li>
                  <li>
                    <Link href="/admin" className="hover:text-ink transition-colors">
                      管理入口
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#e8e4dc] pt-5">
            <p className="font-meta normal-case tracking-normal text-[11px]">
              © {new Date().getFullYear()} AnimeStream
            </p>
            <p className="font-ui text-[12px] text-[#9a978f]">
              播放依赖源站与网络环境 · 权利归原作者与发行方
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
