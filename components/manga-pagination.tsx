import Link from 'next/link';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';

type PaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

function getItems(page: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (page <= 4) {
    return [1, 2, 3, 4, 'ellipsis-end', totalPages - 1, totalPages];
  }
  if (page >= totalPages - 3) {
    return [
      1,
      'ellipsis-start',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', totalPages];
}

export function buildMangaListHref(
  page: number,
  q?: string,
  tag?: string,
  rank?: string,
) {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (q) params.set('q', q);
  if (tag) params.set('tag', tag);
  if (rank) params.set('rank', rank);
  const query = params.toString();
  return query ? `/manga?${query}` : '/manga';
}

export function MangaPagination({
  page,
  totalPages,
  q,
  tag,
  rank,
}: {
  page: number;
  totalPages: number;
  q?: string;
  tag?: string;
  rank?: string;
}) {
  if (totalPages <= 1) return null;

  const items = getItems(page, totalPages);
  const href = (targetPage: number) => buildMangaListHref(targetPage, q, tag, rank);
  const itemClass =
    'inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border px-3 font-ui text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25';

  return (
    <nav className="mt-12 flex flex-col items-center gap-3 font-ui text-[13px] sm:flex-row sm:justify-center" aria-label="漫画分页">
      {page > 1 ? (
        <Link href={href(1)} aria-label="第一页" className={`${itemClass} border-border bg-card px-3 text-ink hover:bg-secondary`}>
          首页
        </Link>
      ) : (
        <span aria-hidden="true" className={`${itemClass} cursor-not-allowed border-transparent bg-transparent px-3 text-soft/45`}>
          首页
        </span>
      )}
      {page > 1 ? (
        <Link href={href(page - 1)} aria-label="上一页" className={`${itemClass} border-border bg-card text-ink hover:bg-secondary`}>
          <IconChevronLeft size={16} />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${itemClass} cursor-not-allowed border-transparent bg-transparent text-soft/45`}>
          <IconChevronLeft size={16} />
        </span>
      )}

      <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5">
        {items.map((item) => {
          if (typeof item !== 'number') {
            return (
              <span key={item} aria-hidden="true" className="inline-flex h-10 min-w-7 items-center justify-center px-1 font-ui text-soft">
                …
              </span>
            );
          }
          if (item === page) {
            return (
              <span key={item} aria-current="page" className={`${itemClass} border-ink bg-ink text-background`}>
                {item}
              </span>
            );
          }
          return (
            <Link key={item} href={href(item)} aria-label={`第 ${item} 页`} className={`${itemClass} border-border bg-card text-ink hover:bg-secondary`}>
              {item}
            </Link>
          );
        })}
      </div>

      {page < totalPages ? (
        <Link href={href(page + 1)} aria-label="下一页" className={`${itemClass} border-border bg-card text-ink hover:bg-secondary`}>
          <IconChevronRight size={16} />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${itemClass} cursor-not-allowed border-transparent bg-transparent text-soft/45`}>
          <IconChevronRight size={16} />
        </span>
      )}
      {page < totalPages ? (
        <Link href={href(totalPages)} aria-label="最后一页" className={`${itemClass} border-border bg-card px-3 text-ink hover:bg-secondary`}>
          末页
        </Link>
      ) : (
        <span aria-hidden="true" className={`${itemClass} cursor-not-allowed border-transparent bg-transparent px-3 text-soft/45`}>
          末页
        </span>
      )}
    </nav>
  );
}
