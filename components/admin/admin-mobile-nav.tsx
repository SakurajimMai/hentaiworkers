'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { IconMenu, IconX } from '@/components/icons';
import type { AdminNavItem } from '@/components/admin/admin-nav';

export function AdminMobileNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const active = (item: AdminNavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <div className="border-t border-border px-4 py-2 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <p className="font-meta normal-case tracking-normal text-[11px]">维护工作区</p>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3 font-ui text-[12px] font-medium text-foreground transition hover:bg-secondary"
          aria-expanded={open}
          aria-controls="admin-mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <IconX size={15} /> : <IconMenu size={15} />}
          {open ? '收起菜单' : '打开菜单'}
        </button>
      </div>
      {open && (
        <nav
          id="admin-mobile-menu"
          className="mx-auto grid max-w-6xl grid-cols-2 gap-1.5 pt-2 font-ui text-[13px]"
          aria-label="移动端后台导航"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active(item) ? 'page' : undefined}
              className={`rounded-xl px-3 py-2.5 transition-colors ${
                active(item)
                  ? 'bg-card font-medium text-ink shadow-[0_1px_0_hsla(30,12%,18%,0.04)]'
                  : 'text-soft hover:bg-card hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
