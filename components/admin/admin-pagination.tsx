import Link from 'next/link';
import {
  IconChevronLeft,
  IconChevronRight,
} from '@/components/icons';
import {
  buildAdminPaginationHref,
  getAdminPaginationModel,
} from '@/components/admin/admin-pagination-model';

const paginationItemClass =
  'inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border px-3 font-ui text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25';
const paginationLinkClass = `${paginationItemClass} border-border bg-card text-foreground hover:border-muted-foreground/50 hover:bg-secondary`;
const paginationDisabledClass = `${paginationItemClass} cursor-not-allowed border-border bg-surface-2 text-muted-foreground/70`;
const paginationCurrentClass = `${paginationItemClass} border-primary bg-primary text-primary-foreground`;

export function AdminPagination({
  page,
  totalPages,
  total,
  basePath,
  query,
  pageParam = 'page',
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
  pageParam?: string;
}) {
  const model = getAdminPaginationModel(page, totalPages);
  const href = (targetPage: number) =>
    buildAdminPaginationHref(basePath, targetPage, query, pageParam);

  return (
    <div className="flex flex-col gap-3 font-ui text-sm text-soft sm:flex-row sm:items-center sm:justify-between">
      <span className="whitespace-nowrap">
        第 {model.page}/{model.totalPages} 页 · 共 {total} 条
      </span>
      {model.totalPages > 1 ? (
        <div className="flex max-w-full flex-col gap-3 sm:flex-row sm:items-center">
          <nav
            aria-label="分页"
            className="flex max-w-full flex-wrap items-center gap-1.5"
          >
            {model.page > 1 ? (
              <Link href={href(1)} aria-label="第一页" className={`${paginationLinkClass} px-3`}>
                首页
              </Link>
            ) : (
              <span aria-disabled="true" className={`${paginationDisabledClass} px-3`}>
                首页
              </span>
            )}
            {model.page > 1 ? (
              <Link
                href={href(model.page - 1)}
                aria-label="上一页"
                className={`${paginationLinkClass} w-10 px-0`}
              >
                <IconChevronLeft size={17} />
              </Link>
            ) : (
              <span
                aria-label="上一页"
                aria-disabled="true"
                className={`${paginationDisabledClass} w-10 px-0`}
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
                    className="inline-flex h-10 min-w-7 items-center justify-center px-1 text-muted-foreground"
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
                >
                  {item}
                </Link>
              );
            })}

            {model.page < model.totalPages ? (
              <Link
                href={href(model.page + 1)}
                aria-label="下一页"
                className={`${paginationLinkClass} w-10 px-0`}
              >
                <IconChevronRight size={17} />
              </Link>
            ) : (
              <span
                aria-label="下一页"
                aria-disabled="true"
                className={`${paginationDisabledClass} w-10 px-0`}
              >
                <IconChevronRight size={17} />
              </span>
            )}
            {model.page < model.totalPages ? (
              <Link
                href={href(model.totalPages)}
                aria-label="最后一页"
                className={`${paginationLinkClass} px-3`}
              >
                末页
              </Link>
            ) : (
              <span aria-disabled="true" className={`${paginationDisabledClass} px-3`}>
                末页
              </span>
            )}
          </nav>
          <form method="get" action={basePath} className="flex items-center gap-1.5">
            {Object.entries(query ?? {}).map(([key, value]) =>
              value && key !== pageParam ? (
                <input key={key} type="hidden" name={key} value={value} />
              ) : null,
            )}
            <label className="sr-only" htmlFor={`${pageParam}-jump`}>
              跳转到页码
            </label>
            <input
              id={`${pageParam}-jump`}
              name={pageParam}
              type="number"
              min={1}
              max={model.totalPages}
              defaultValue={model.page}
              className="admin-input !h-10 !w-16 !px-2 text-center"
            />
            <button type="submit" className="btn-ghost !h-10 !px-3 !text-[12px]">
              跳转
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
