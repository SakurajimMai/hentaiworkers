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
  'inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border px-3 font-ui text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917]/20';
const paginationLinkClass = `${paginationItemClass} border-[#e1ded6] bg-white text-[#34322f] hover:border-[#c8c3b9] hover:bg-[#f5f3ee]`;
const paginationDisabledClass = `${paginationItemClass} cursor-not-allowed border-[#ebe8e1] bg-[#f8f7f4] text-[#aaa69f]`;
const paginationCurrentClass = `${paginationItemClass} border-[#1a1917] bg-[#1a1917] text-white`;

export function AdminPagination({
  page,
  totalPages,
  total,
  basePath,
  query,
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}) {
  const model = getAdminPaginationModel(page, totalPages);
  const href = (targetPage: number) =>
    buildAdminPaginationHref(basePath, targetPage, query);

  return (
    <div className="flex flex-col gap-3 font-ui text-sm text-[#787774] sm:flex-row sm:items-center sm:justify-between">
      <span className="whitespace-nowrap">
        第 {model.page}/{model.totalPages} 页 · 共 {total} 条
      </span>
      <nav
        aria-label="分页"
        className="flex max-w-full flex-wrap items-center gap-1.5"
      >
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
                className="inline-flex h-10 min-w-7 items-center justify-center px-1 text-[#8d8982]"
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
      </nav>
    </div>
  );
}
