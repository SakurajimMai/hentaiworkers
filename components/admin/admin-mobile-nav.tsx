'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { IconMenu, IconX } from '@/components/icons';
import { AdminNavGlyph, type AdminNavItem } from '@/components/admin/admin-nav';

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
    <div className="border-t border-border">
      {/* Height comes from the shared variable so --admin-header-height keeps telling
          sticky page content the truth about where this bar ends. */}
      <div className="admin-shell flex h-[calc(var(--admin-nav-row-height)-1px)] items-center justify-between gap-3">
        <p className="font-meta truncate normal-case tracking-normal text-[11px]">维护工作区</p>
        <button
          type="button"
          className="inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-3 font-ui text-[12px] font-medium text-foreground transition hover:bg-secondary"
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
          className="admin-shell grid grid-cols-2 gap-1.5 pb-3 font-ui text-[13px]"
          aria-label="移动端后台导航"
        >
          {items.map((item) => {
            const isCurrent = active(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrent ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors ${
                  isCurrent
                    ? 'bg-card font-medium text-ink shadow-sm border border-border/80'
                    : 'text-soft hover:bg-card hover:text-ink'
                }`}
              >
                <AdminNavGlyph
                  name={item.icon}
                  size={15}
                  className={isCurrent ? 'text-accent' : 'text-muted-foreground'}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
