import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { actionLogout } from './actions';
import { AdminNav, type AdminNavItem } from '@/components/admin/admin-nav';
import { AdminMobileNav } from '@/components/admin/admin-mobile-nav';
import { ThemeMenu } from '@/components/theme-menu';

const NAV: AdminNavItem[] = [
  { href: '/admin', label: '概览', exact: true, icon: 'grid' },
  { href: '/admin/animes', label: '里番', icon: 'film' },
  { href: '/admin/mangas', label: '漫画', icon: 'book' },
  { href: '/admin/tags', label: '里番标签', icon: 'tag' },
  { href: '/admin/manga-tags', label: '漫画标签', icon: 'tag' },
  { href: '/admin/users', label: '用户', icon: 'users' },
  { href: '/admin/settings', label: '系统', icon: 'settings' },
  { href: '/admin/account', label: '账户', icon: 'user' },
];

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
          <Link href="/admin" className="group shrink-0 font-ui text-sm font-semibold tracking-tight text-ink">
            <span className="inline-flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary font-mono text-[11px] font-bold text-primary-foreground shadow-sm transition group-hover:scale-105">
                AS
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-[13px] font-semibold text-ink">AnimeStream</span>
                <span className="font-meta text-[9px] normal-case tracking-normal text-muted-foreground mt-0.5">管理中心</span>
              </span>
            </span>
          </Link>
          <AdminNav items={NAV} className="hidden lg:flex" />
          <div className="ml-auto flex items-center gap-2 font-ui text-[13px]">
            <ThemeMenu compact />
            <Link
              href="/admin/account"
              className="hidden max-w-[12rem] items-center gap-1.5 truncate rounded-full border border-border bg-card px-3 py-1 text-[12px] text-foreground transition hover:border-border hover:bg-secondary sm:inline-flex"
              title="打开账户"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
              <span className="truncate font-medium">{session.username}</span>
            </Link>
            <form action={actionLogout}>
              <button
                type="submit"
                className="rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-foreground transition hover:bg-secondary hover:text-danger active:scale-[0.98]"
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
