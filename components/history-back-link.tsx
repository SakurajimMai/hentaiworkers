'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { CATALOG_RETURN_KEY, isHistoryBackTarget } from '@/lib/client/catalog-scroll-restoration';

export function HistoryBackLink({
  href,
  className,
  children,
  'aria-label': ariaLabel,
  title,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
  title?: string;
}) {
  const router = useRouter();

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    try {
      if (!isHistoryBackTarget(sessionStorage.getItem(CATALOG_RETURN_KEY), href)) return;
    } catch {
      return;
    }
    event.preventDefault();
    router.back();
  };

  return (
    <Link href={href} className={className} onClick={onClick} aria-label={ariaLabel} title={title}>
      {children}
    </Link>
  );
}
