'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { ComponentType } from 'react';
import {
  IconBook,
  IconExternalLink,
  IconFilm,
  IconGrid,
  IconSettings,
  IconTag,
  IconUser,
  IconUsers,
} from '@/components/icons';

export type AdminNavIconKey = 'grid' | 'film' | 'book' | 'tag' | 'users' | 'settings' | 'user';

const ADMIN_NAV_ICONS: Record<
  AdminNavIconKey,
  ComponentType<{ size?: number; className?: string }>
> = {
  grid: IconGrid,
  film: IconFilm,
  book: IconBook,
  tag: IconTag,
  users: IconUsers,
  settings: IconSettings,
  user: IconUser,
};

export type AdminNavItem = {
  href: string;
  label: string;
  exact?: boolean;
  icon?: AdminNavIconKey;
};

export function AdminNavGlyph({
  name,
  size = 14,
  className,
}: {
  name?: AdminNavIconKey;
  size?: number;
  className?: string;
}) {
  if (!name) return null;
  const Icon = ADMIN_NAV_ICONS[name];
  return <Icon size={size} className={className} />;
}

export function AdminNav({ items, className = '' }: { items: AdminNavItem[]; className?: string }) {
  const pathname = usePathname() || '';

  return (
    <nav
      // The bar is a fixed height, so the links must never wrap out of it. They stay on
      // one nowrap row that can shrink and scroll instead — the last resort when a
      // zoomed-in or scaled display leaves less room than the labels need.
      className={`flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1 py-1 font-ui text-[13px] text-soft ${className}`}
      aria-label="后台导航"
    >
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-all duration-200 ${
              active
                ? 'bg-card text-ink font-medium shadow-sm border border-border/70'
                : 'hover:bg-card/70 hover:text-ink'
            }`}
          >
            <AdminNavGlyph
              name={item.icon}
              size={14}
              className={active ? 'text-accent' : 'text-muted-foreground'}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <Link
        href="/"
        target="_blank"
        className="ml-1 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] text-soft transition-colors hover:bg-card hover:text-ink"
        title="在新标签页打开前台"
      >
        <span>前台</span>
        <IconExternalLink size={12} className="opacity-70" />
      </Link>
    </nav>
  );
}
