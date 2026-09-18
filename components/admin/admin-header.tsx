import Link from 'next/link';

import { AdminNav, type AdminNavItem } from '@/components/admin/admin-nav';
import { AdminMobileNav } from '@/components/admin/admin-mobile-nav';
import { ThemeMenu } from '@/components/theme-menu';

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: '概览', exact: true, icon: 'grid' },
  { href: '/admin/animes', label: '里番', icon: 'film' },
  { href: '/admin/mangas', label: '漫画', icon: 'book' },
  { href: '/admin/tags', label: '里番标签', icon: 'tag' },
  { href: '/admin/manga-tags', label: '漫画标签', icon: 'tag' },
  { href: '/admin/users', label: '用户', icon: 'users' },
  { href: '/admin/settings', label: '系统', icon: 'settings' },
  { href: '/admin/account', label: '账户', icon: 'user' },
];

export function AdminHeader({
  username,
  logoutAction,
}: {
  username?: string;
  logoutAction: () => void | Promise<void>;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/90 bg-background/88 backdrop-blur-md">
      <div className="admin-shell flex h-[var(--admin-bar-height)] items-center gap-4">
        <Link
          href="/admin"
          className="group shrink-0 font-ui text-sm font-semibold tracking-tight text-ink"
        >
          <span className="inline-flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary font-mono text-[11px] font-bold text-primary-foreground shadow-sm transition group-hover:scale-105">
              AS
            </span>
            {/* Between `lg` and `xl` the nav needs this space more than the wordmark does. */}
            <span className="flex flex-col leading-none lg:hidden xl:flex">
              <span className="text-[13px] font-semibold text-ink">AnimeStream</span>
              <span className="font-meta text-[9px] normal-case tracking-normal text-muted-foreground mt-0.5">管理中心</span>
            </span>
          </span>
        </Link>
        <AdminNav items={ADMIN_NAV_ITEMS} className="hidden lg:flex" />
        <div className="ml-auto flex shrink-0 items-center gap-2 font-ui text-[13px]">
          <ThemeMenu compact />
          {/* The 账户 nav item covers this below `xl`, where the bar has no room to spare. */}
          {username && (
            <Link
              href="/admin/account"
              // 8rem is what the bar can spare once the destinations have their room, so a
              // long name is ellipsised here instead of pushing the nav out of reach.
              className="hidden min-w-0 max-w-[8rem] items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12px] text-foreground transition hover:border-border hover:bg-secondary sm:inline-flex lg:hidden xl:inline-flex"
              title="打开账户"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--success))]" />
              <span className="truncate font-medium" title={username}>
                {username}
              </span>
            </Link>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              className="whitespace-nowrap rounded-full border border-border bg-card px-3 py-1 text-[12px] font-medium text-foreground transition hover:bg-secondary hover:text-danger active:scale-[0.98]"
            >
              退出
            </button>
          </form>
        </div>
      </div>
      <div className="lg:hidden">
        <AdminMobileNav items={[...ADMIN_NAV_ITEMS, { href: '/', label: '前台' }]} />
      </div>
    </header>
  );
}
