'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { IconPlay, IconSearch } from '@/components/icons';
import {
  clearSearchHistory,
  pushSearchHistory,
  readSearchHistory,
} from '@/lib/client/search-history';

export function SiteHeaderClient({ accountSlot }: { accountSlot: ReactNode }) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setHistory(readSearchHistory());
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    pushSearchHistory(query);
    setHistory(readSearchHistory());
    const target = pathname.startsWith('/works') ? '/works' : '/browse';
    router.push(`${target}?search=${encodeURIComponent(query)}`);
    setFocused(false);
  };

  const linkClass = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-[13px] transition-colors duration-200 ${
      active
        ? 'bg-white text-ink font-medium shadow-[0_1px_0_hsla(30,12%,18%,0.04)]'
        : 'text-soft hover:text-ink hover:bg-white/60'
    }`;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#e8e4dc]/90 bg-[#f6f4ef]/88 backdrop-blur-md">
      <div className="page-shell flex h-14 items-center gap-3 sm:gap-4 !max-w-5xl">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1a1917] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition group-hover:scale-[1.03]">
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
          <Link href="/works" className={linkClass(pathname.startsWith('/works'))}>
            动漫
          </Link>
          <Link href="/history" className={linkClass(pathname.startsWith('/history'))}>
            历史
          </Link>
          <Link href="/favorites" className={linkClass(pathname.startsWith('/favorites'))}>
            片单
          </Link>
        </nav>

        <form onSubmit={onSubmit} className="flex-1 max-w-sm ml-auto relative">
          <div className="relative flex items-center">
            <IconSearch
              size={15}
              className={`absolute left-3 transition-colors ${focused ? 'text-[#111]' : 'text-[#9a978f]'}`}
            />
            <input
              type="search"
              placeholder={pathname.startsWith('/works') ? '搜索动漫' : '搜索里番'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => {
                setFocused(true);
                setHistory(readSearchHistory());
              }}
              onBlur={() => {
                window.setTimeout(() => setFocused(false), 150);
              }}
              className={`h-9 w-full rounded-full border bg-white/90 pl-9 pr-3 font-ui text-[13px] outline-none transition-all ${
                focused
                  ? 'border-[#1a1917]/25 shadow-[0_0_0_3px_hsla(30,12%,18%,0.08)]'
                  : 'border-[#e8e4dc] hover:border-[#d8d4cb]'
              }`}
            />
          </div>
          {focused && history.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-[#e8e4dc] bg-white shadow-ink">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#f0eee9]">
                <span className="font-meta text-[11px]">最近搜索</span>
                <button
                  type="button"
                  className="font-ui text-[11px] text-[#6f6d68] hover:text-[#111]"
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
                      className="w-full text-left px-3.5 py-2.5 font-ui text-[13px] text-[#444] hover:bg-[#f7f5f0]"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQ(item);
                        pushSearchHistory(item);
                        router.push(
                          `${pathname.startsWith('/works') ? '/works' : '/browse'}?search=${encodeURIComponent(item)}`,
                        );
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

        {accountSlot}
      </div>
    </header>
  );
}
