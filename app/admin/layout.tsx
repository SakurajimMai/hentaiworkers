import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { actionLogout } from './actions';
import { AdminNav } from '@/components/admin/admin-nav';
import { AdminMobileNav } from '@/components/admin/admin-mobile-nav';
import { ThemeMenu } from '@/components/theme-menu';

const NAV = [
  { href: '/admin', label: '概览', exact: true },
  { href: '/admin/animes', label: '里番' },
  { href: '/admin/mangas', label: '漫画' },
  { href: '/admin/tags', label: '里番标签' },
  { href: '/admin/manga-tags', label: '漫画标签' },
  { href: '/admin/users', label: '用户' },
  { href: '/admin/settings', label: '系统' },
  { href: '/admin/account', label: '账户' },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const isAuthed = session.isLoggedIn && session.role === 'admin';

  if (!isAuthed) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <a href="#admin-main" className="skip-link">
          跳到主要内容
        </a>
        <div id="admin-main">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a href="#admin-main" className="skip-link">
        跳到主要内容
      </a>
      <header className="sticky top-0 z-40 border-b border-border/90 bg-background/88 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4 sm:px-6">
          <Link href="/admin" className="shrink-0 font-ui text-sm font-semibold tracking-tight text-ink">
            <span className="inline-flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-primary font-mono text-[10px] text-primary-foreground">
                AS
              </span>
              管理中心
            </span>
          </Link>
          <AdminNav items={[...NAV]} className="hidden lg:flex" />
          <div className="ml-auto flex items-center gap-2.5 font-ui text-[13px]">
            <ThemeMenu compact />
            <Link
              href="/admin/account"
              className="hidden max-w-[11rem] truncate rounded-full border border-border bg-card px-2.5 py-1 text-[12px] text-soft transition hover:border-ink/20 hover:text-ink sm:inline"
              title="打开账户"
            >
              {session.username}
            </Link>
            <form action={actionLogout}>
              <button
                type="submit"
                className="rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-secondary active:scale-[0.98]"
              >
                退出
              </button>
            </form>
          </div>
        </div>
        <div className="lg:hidden">
          <AdminMobileNav items={[...NAV, { href: '/', label: '前台' }]} />
        </div>
      </header>
      <div id="admin-main" className="mx-auto max-w-6xl px-4 py-8 pb-14 sm:px-6">
        {children}
      </div>
    </div>
  );
}
