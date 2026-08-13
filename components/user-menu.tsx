'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  IconBookmark,
  IconChevronDown,
  IconHistory,
  IconLogout,
  IconShield,
  IconUser,
} from '@/components/icons';
import { actionPublicLogout } from '@/app/(site)/auth/actions';

type UserMenuProps = {
  name: string;
  isAdmin: boolean;
  variant?: 'dropdown' | 'list';
};

const MENU_LINKS = [
  { href: '/account', label: '用户中心', icon: IconUser },
  { href: '/favorites', label: '我的收藏', icon: IconBookmark },
  { href: '/history', label: '观看历史', icon: IconHistory },
] as const;

export function UserMenu({ name, isAdmin, variant = 'dropdown' }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const links = [
    ...MENU_LINKS,
    ...(isAdmin ? [{ href: '/admin', label: '管理中心', icon: IconShield } as const] : []),
  ];

  if (variant === 'list') {
    return (
      <div className="grid gap-0.5 font-ui" aria-label="账号菜单">
        <p className="truncate px-3 pb-1 font-meta text-[11px] normal-case tracking-normal">
          {name}
        </p>
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-soft transition-colors hover:bg-card hover:text-ink"
          >
            <item.icon size={14} />
            {item.label}
          </Link>
        ))}
        <form action={actionPublicLogout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-soft transition-colors hover:bg-card hover:text-ink"
          >
            <IconLogout size={15} />
            退出登录
          </button>
        </form>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card pl-2.5 pr-2 font-ui text-[13px] text-foreground transition hover:bg-secondary active:scale-[0.98]"
      >
        <IconUser size={15} />
        <span className="max-w-[7.5rem] truncate">{name}</span>
        <IconChevronDown
          size={13}
          className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-[70] min-w-44 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-ink"
        >
          <p className="truncate border-b border-border px-3 py-2 font-meta text-[11px] normal-case tracking-normal">
            {name}
          </p>
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 font-ui text-[13px] text-foreground transition hover:bg-secondary"
            >
              <item.icon size={14} className="text-muted-foreground" />
              {item.label}
            </Link>
          ))}
          <form action={actionPublicLogout} className="border-t border-border mt-1 pt-1">
            <button
              type="submit"
              role="menuitem"
              className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left font-ui text-[13px] text-foreground transition hover:bg-secondary"
            >
              <IconLogout size={14} className="text-muted-foreground" />
              退出登录
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
