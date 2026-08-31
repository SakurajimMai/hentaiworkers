import Link from 'next/link';
import { IconChevronLeft, IconChevronRight } from '@/components/icons';
import {
  buildPaginationHref,
  getPaginationModel,
  type PaginationQuery,
} from '@/components/pagination-model';

const paginationItemClass =
  'inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full border px-3 font-ui text-sm tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const paginationLinkClass = `${paginationItemClass} border-border bg-card text-foreground hover:border-muted-foreground/50 hover:bg-secondary`;
const paginationDisabledClass = `${paginationItemClass} cursor-not-allowed border-border bg-surface-2 text-muted-foreground/70`;
const paginationCurrentClass = `${paginationItemClass} border-primary bg-primary text-primary-foreground`;

export function LibraryPagination({
  page,
  totalPages,
  total,
  basePath,
  query,
  pageParam = 'page',
  ariaLabel = '分页',
}: {
  page: number;
  totalPages: number;
  total?: number;
  basePath: string;
  query?: PaginationQuery;
  pageParam?: string;
  ariaLabel?: string;
}) {
  const model = getPaginationModel(page, totalPages);
  const href = (targetPage: number) =>
    buildPaginationHref(basePath, targetPage, query, pageParam);
  const normalizedTotal =
    total !== undefined && Number.isFinite(total)
      ? Math.max(0, Math.trunc(total))
      : null;

  if (model.totalPages <= 1) {
    return normalizedTotal === null ? null : (
      <p className="font-ui text-sm text-soft">共 {normalizedTotal} 条</p>
    );
  }

  return (
    <div className="flex max-w-full flex-col items-center gap-3 font-ui text-sm text-soft">
      {normalizedTotal !== null ? (
        <p className="tabular">
          第 {model.page}/{model.totalPages} 页 · 共 {normalizedTotal} 条
        </p>
      ) : null}
      <nav
        aria-label={ariaLabel}
        className="flex max-w-full flex-wrap items-center justify-center gap-1.5"
      >
        {model.page > 1 ? (
          <Link
            href={href(model.page - 1)}
            aria-label="上一页"
            className={`${paginationLinkClass} w-11 px-0`}
            prefetch={false}
          >
            <IconChevronLeft size={17} />
          </Link>
        ) : (
          <span
            aria-label="上一页"
            aria-disabled="true"
            className={`${paginationDisabledClass} w-11 px-0`}
          >
            <IconChevronLeft size={17} />
          </span>
        )}

        {model.items.map((item) => {
          if (typeof item !== 'number') {
            return (
              <span
                key={item}
                aria-hidden="true"
                className="inline-flex h-11 min-w-6 items-center justify-center px-1 text-muted-foreground"
              >
                …
              </span>
            );
          }

          if (item === model.page) {
            return (
              <span
                key={item}
                aria-current="page"
                aria-label={`第 ${item} 页，当前页`}
                className={paginationCurrentClass}
              >
                {item}
              </span>
            );
          }

          return (
            <Link
              key={item}
              href={href(item)}
              aria-label={`第 ${item} 页`}
              className={paginationLinkClass}
              prefetch={false}
            >
              {item}
            </Link>
          );
        })}

        {model.page < model.totalPages ? (
          <Link
            href={href(model.page + 1)}
            aria-label="下一页"
            className={`${paginationLinkClass} w-11 px-0`}
            prefetch={false}
          >
            <IconChevronRight size={17} />
          </Link>
        ) : (
          <span
            aria-label="下一页"
            aria-disabled="true"
            className={`${paginationDisabledClass} w-11 px-0`}
          >
            <IconChevronRight size={17} />
          </span>
        )}
      </nav>
    </div>
  );
}
