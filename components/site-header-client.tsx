'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconMenu, IconPlay, IconSearch, IconX } from '@/components/icons';
import { ThemeMenu } from '@/components/theme-menu';
import {
  clearSearchHistory,
  pushSearchHistory,
  readSearchHistory,
} from '@/lib/client/search-history';

export function SiteHeaderClient({
  accountSlot,
  mobileAccountSlot,
}: {
  accountSlot: ReactNode;
  mobileAccountSlot?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [portalReady, setPortalReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    setHistory(readSearchHistory());
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    pushSearchHistory(query);
    setHistory(readSearchHistory());
    router.push(`/search?q=${encodeURIComponent(query)}`);
    setFocused(false);
  };

  if (/\/manga\/[^/]+\/read(?:\/|$)/.test(pathname)) {
    return null;
  }

  const linkClass = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-[13px] transition-colors duration-200 ${
      active
        ? 'bg-card text-ink font-medium shadow-[0_1px_0_hsla(30,12%,18%,0.04)]'
        : 'text-soft hover:text-ink hover:bg-card'
    }`;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/90 bg-background/90 backdrop-blur-md">
      <div className="page-shell flex min-h-14 items-center gap-2.5 sm:gap-4 !max-w-6xl">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition group-hover:scale-[1.03]">
            <IconPlay size={12} className="ml-px" />
          </span>
          <span className="hidden sm:inline font-ui text-[14px] font-semibold tracking-tight text-ink">
            AnimeStream
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5 font-ui" aria-label="主导航">
          <Link href="/" className={linkClass(pathname === '/')}>
            首页
          </Link>
          <Link href="/browse" className={linkClass(pathname.startsWith('/browse'))}>
            里番
          </Link>
          <Link href="/manga" className={linkClass(pathname.startsWith('/manga'))}>
            漫画
          </Link>
          <Link href="/history" className={linkClass(pathname.startsWith('/history'))}>
            历史
          </Link>
          <Link href="/favorites" className={linkClass(pathname.startsWith('/favorites'))}>
            收藏
          </Link>
        </nav>

        <form onSubmit={onSubmit} className="relative ml-auto w-[min(38vw,11rem)] flex-1 sm:max-w-sm">
          <div className="relative flex items-center">
            <IconSearch
              size={15}
              className={`absolute left-3 transition-colors ${focused ? 'text-ink' : 'text-muted-foreground'}`}
            />
            <input
              type="search"
              placeholder="搜索里番和漫画"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => {
                setFocused(true);
                setHistory(readSearchHistory());
              }}
              onBlur={() => {
                window.setTimeout(() => setFocused(false), 150);
              }}
              className={`h-9 w-full rounded-full border bg-card pl-9 pr-3 font-ui text-[13px] text-foreground outline-none transition-all ${
                focused
                  ? 'border-primary/25 shadow-[0_0_0_3px_hsla(30,12%,18%,0.08)]'
                  : 'border-border hover:border-muted-foreground'
              }`}
            />
          </div>
          {focused && history.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-ink">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
                <span className="font-meta text-[11px]">最近搜索</span>
                <button
                  type="button"
                  className="font-ui text-[11px] text-muted-foreground hover:text-foreground"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    clearSearchHistory();
                    setHistory([]);
                  }}
                >
                  清除
                </button>
              </div>
              <ul className="max-h-56 overflow-auto py-1">
                {history.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      className="w-full text-left px-3.5 py-2.5 font-ui text-[13px] text-foreground hover:bg-secondary"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQ(item);
                        pushSearchHistory(item);
                        router.push(`/search?q=${encodeURIComponent(item)}`);
                        setFocused(false);
                      }}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeMenu compact />
          <div className="hidden md:flex">{accountSlot}</div>
        </div>

        <button
          type="button"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card text-ink transition hover:bg-secondary active:scale-[0.97] md:hidden"
          aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <IconX size={17} /> : <IconMenu size={17} />}
        </button>
      </div>

      {portalReady && menuOpen
        ? createPortal(
            <div className="md:hidden">
              <button
                type="button"
                className="fixed inset-0 z-[80] bg-ink/40"
                aria-label="关闭菜单"
                onClick={() => setMenuOpen(false)}
              />
              <aside
                className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[90] flex max-h-[min(28rem,calc(100dvh-1.5rem))] w-[min(16rem,84vw)] flex-col overflow-y-auto rounded-2xl border border-border bg-background px-3 py-3 shadow-ink"
                aria-label="移动端菜单"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="font-ui text-[13px] font-semibold text-ink">菜单</p>
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-ink"
                    aria-label="关闭菜单"
                    onClick={() => setMenuOpen(false)}
                  >
                    <IconX size={16} />
                  </button>
                </div>
                <nav className="grid gap-0.5 font-ui" aria-label="移动端主导航">
                  {[
                    ['首页', '/'],
                    ['里番', '/browse'],
                    ['漫画', '/manga'],
                    ['历史', '/history'],
                    ['收藏', '/favorites'],
                  ].map(([label, href]) => (
                    <Link
                      key={href}
                      href={href}
                      className={`rounded-lg px-3 py-2 text-[13px] transition-colors ${
                        pathname === href || (href !== '/' && pathname.startsWith(href))
                          ? 'bg-card font-medium text-ink'
                          : 'text-soft hover:bg-card hover:text-ink'
                      }`}
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
                <div className="mt-2 border-t border-border pt-2">
                  {mobileAccountSlot ?? accountSlot}
                </div>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}
