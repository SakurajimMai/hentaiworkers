'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type AdminNavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

export function AdminNav({
  items,
  className = '',
  compact = false,
}: {
  items: AdminNavItem[];
  className?: string;
  compact?: boolean;
}) {
  const pathname = usePathname() || '';

  return (
    <nav
      className={`flex flex-wrap items-center gap-1 font-ui text-[13px] text-[#6f6d68] ${className}`}
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
            className={`shrink-0 rounded-full transition-colors duration-200 ${
              compact ? 'px-2.5 py-1 text-[12px]' : 'px-2.5 py-1'
            } ${
              active
                ? 'bg-white text-[#1a1917] font-medium shadow-[0_1px_0_rgba(26,25,23,0.04)]'
                : 'hover:bg-white hover:text-[#1a1917]'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      {!compact && (
        <Link
          href="/"
          className="rounded-full px-2.5 py-1 transition-colors hover:bg-white hover:text-[#1a1917]"
        >
          前台
        </Link>
      )}
    </nav>
  );
}
