import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { WatchProgressMergeOnLogin } from '@/components/watch-progress-merge';
import { getIdentityService } from '@/lib/server/identity';
import { getSystemSettingsService } from '@/lib/server/system';
import { getSiteSeo } from '@/lib/server/site-metadata';

export const dynamic = 'force-dynamic';

const emptySite = {
  androidDownloadUrl: '',
  androidDownloadLabel: '下载 App',
  telegramUrl: '',
  telegramLabel: 'Telegram',
} as const;

async function readPublicSiteConfig() {
  try {
    return await getSystemSettingsService().getPublicSiteConfig();
  } catch {
    return emptySite;
  }
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, site, seo] = await Promise.all([
    getIdentityService().getCurrentUser(),
    readPublicSiteConfig(),
    getSiteSeo(),
  ]);
  const siteTitle = seo.title || 'AnimeStream';

  return (
    <div className="site-shell min-h-dvh bg-background text-foreground flex flex-col">
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      <SiteHeader siteTitle={siteTitle} />
      <WatchProgressMergeOnLogin enabled={!!user} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <footer className="mt-auto border-t border-border bg-[hsl(var(--surface-2))]">
        <div className="page-shell py-12 sm:py-14 flex flex-col gap-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-8">
            <div className="max-w-sm">
              <p className="font-ui text-[15px] font-semibold tracking-tight text-ink">
                {siteTitle}
              </p>
            </div>
            <div
              className={`grid grid-cols-2 gap-x-10 gap-y-6 font-ui text-[13px] ${
                site.telegramUrl ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
              }`}
            >
              <div>
                <p className="font-meta mb-2.5">浏览</p>
                <ul className="space-y-1.5 text-soft">
                  <li>
                    <Link href="/browse" className="link-soft">
                      里番
                    </Link>
                  </li>
                  <li>
                    <Link href="/manga" className="link-soft">
                      漫画
                    </Link>
                  </li>
                  <li>
                    <Link href="/history" className="link-soft">
                      历史
                    </Link>
                  </li>
                  {site.androidDownloadUrl ? (
                    <li>
                      <a
                        href={site.androidDownloadUrl}
                        className="link-soft"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {site.androidDownloadLabel}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>
              <div>
                <p className="font-meta mb-2.5">账号</p>
                <ul className="space-y-1.5 text-soft">
                  <li>
                    <Link href="/favorites" className="link-soft">
                      收藏
                    </Link>
                  </li>
                  <li>
                    <Link href="/login" className="link-soft">
                      登录
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="link-soft">
                      注册
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="font-meta mb-2.5">关于</p>
                <ul className="space-y-1.5 text-soft">
                  <li>
                    <Link href="/privacy" className="link-soft">
                      隐私说明
                    </Link>
                  </li>
                  <li>
                    <Link href="/terms" className="link-soft">
                      使用条款
                    </Link>
                  </li>
                </ul>
              </div>
              {site.telegramUrl ? (
                <div>
                  <p className="font-meta mb-2.5">社区</p>
                  <ul className="space-y-1.5 text-soft">
                    <li>
                      <a
                        href={site.telegramUrl}
                        className="link-soft"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {site.telegramLabel}
                      </a>
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border pt-5">
            <p className="font-meta normal-case tracking-normal text-[11px]">
              © {new Date().getFullYear()} {siteTitle}
            </p>
            <p className="font-ui text-[12px] text-soft">
              播放依赖源站与网络环境 · 权利归原作者与发行方
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
