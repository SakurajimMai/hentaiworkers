'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';
import { LISTING_PARAMS, buildListingPaginationHref } from '@/components/pagination-model';
import { cn } from '@/lib/utils';

/**
 * Real anchors instead of router.push buttons: crawlers only discover paginated catalog pages
 * through followable links, and users get middle-click / copy-link behaviour for free.
 */
export function Pagination({
  page,
  totalPages,
  keepParams = LISTING_PARAMS,
}: {
  page: number;
  totalPages: number;
  keepParams?: readonly string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const query: Record<string, string[]> = {};
  for (const key of keepParams) {
    const values = searchParams.getAll(key);
    if (values.length) query[key] = values;
  }
  const href = (p: number) => buildListingPaginationHref(pathname, query, p, keepParams);

  const neighbors = 2;
  const items: (number | 'e')[] = [];
  const start = Math.max(2, page - neighbors);
  const end = Math.min(totalPages - 1, page + neighbors);
  items.push(1);
  if (start > 2) items.push('e');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < totalPages - 1) items.push('e');
  if (totalPages > 1) items.push(totalPages);

  const edge = (target: number, disabled: boolean, rel: 'prev' | 'next', label: string, icon: React.ReactNode) =>
    disabled ? (
      <Button variant="outline" size="icon" disabled aria-label={label}>
        {icon}
      </Button>
    ) : (
      <Link
        href={href(target)}
        rel={rel}
        aria-label={label}
        className={cn(buttonVariants({ variant: 'outline', size: 'icon' }))}
      >
        {icon}
      </Link>
    );

  return (
    <nav className="flex items-center gap-1 flex-wrap justify-center" aria-label="分页">
      {edge(page - 1, page === 1, 'prev', '上一页', <IconChevronLeft size={16} />)}
      {items.map((it, idx) =>
        typeof it === 'number' ? (
          it === page ? (
            <span
              key={it}
              aria-current="page"
              className={cn(buttonVariants({ variant: 'default', size: 'icon' }), 'tabular')}
            >
              {it}
            </span>
          ) : (
            <Link
              key={it}
              href={href(it)}
              className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'tabular')}
            >
              {it}
            </Link>
          )
        ) : (
          <span key={`e-${idx}`} className="px-1 font-meta text-soft">
            ···
          </span>
        )
      )}
      {edge(page + 1, page === totalPages, 'next', '下一页', <IconChevronRight size={16} />)}
    </nav>
  );
}
