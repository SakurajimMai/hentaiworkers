'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const go = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`${pathname}?${params.toString()}`);
  };

  const neighbors = 2;
  const items: (number | 'e')[] = [];
  const start = Math.max(2, page - neighbors);
  const end = Math.min(totalPages - 1, page + neighbors);
  items.push(1);
  if (start > 2) items.push('e');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < totalPages - 1) items.push('e');
  if (totalPages > 1) items.push(totalPages);

  return (
    <nav className="flex items-center gap-1 flex-wrap justify-center" aria-label="分页">
      <Button variant="outline" size="icon" disabled={page === 1} onClick={() => go(page - 1)}>
        <IconChevronLeft size={16} />
      </Button>
      {items.map((it, idx) =>
        typeof it === 'number' ? (
          <Button
            key={it}
            variant={it === page ? 'default' : 'outline'}
            size="icon"
            className="tabular"
            onClick={() => go(it)}
          >
            {it}
          </Button>
        ) : (
          <span key={`e-${idx}`} className="px-1 font-meta text-[#787774]">
            ···
          </span>
        )
      )}
      <Button
        variant="outline"
        size="icon"
        disabled={page === totalPages}
        onClick={() => go(page + 1)}
      >
        <IconChevronRight size={16} />
      </Button>
    </nav>
  );
}
