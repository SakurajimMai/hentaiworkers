'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { IconPlay, IconSearch } from '@/components/icons';

export function SiteHeaderClient({ accountSlot }: { accountSlot: ReactNode }) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/browse?search=${encodeURIComponent(q.trim())}`);
  };

  const linkClass = (active: boolean) =>
    `text-[13px] transition-colors duration-200 ${
      active ? 'text-[#111] font-medium' : 'text-[#787774] hover:text-[#111]'
    }`;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#EAEAEA] bg-[#F7F6F3]/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 sm:gap-5 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-[#111] text-white">
            <IconPlay size={12} className="ml-px" />
          </span>
          <span className="hidden sm:inline font-ui text-[14px] font-medium tracking-tight text-[#111]">
            AnimeStream
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 font-ui" aria-label="主导航">
          <Link href="/" className={linkClass(pathname === '/')}>
            首页
          </Link>
          <Link href="/browse" className={linkClass(pathname.startsWith('/browse'))}>
            片库
          </Link>
          <Link
            href="/favorites"
            className={linkClass(pathname.startsWith('/favorites'))}
          >
            收藏
          </Link>
        </nav>

        <form onSubmit={onSubmit} className="flex-1 max-w-sm ml-auto">
          <div className="relative flex items-center">
            <IconSearch
              size={15}
              className={`absolute left-3 ${focused ? 'text-[#111]' : 'text-[#787774]'}`}
            />
            <input
              type="search"
              placeholder="搜索片名或标签"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className={`h-9 w-full rounded-sm border bg-white pl-9 pr-3 font-ui text-[13px] outline-none ${
                focused ? 'border-[#111]/30' : 'border-[#EAEAEA]'
              }`}
            />
          </div>
        </form>

        {accountSlot}
      </div>
    </header>
  );
}
