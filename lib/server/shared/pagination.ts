export const LIBRARY_PAGE_SIZE = 20;
export const MAX_LIBRARY_PAGE_SIZE = 100;

export type PageResult<T> = Readonly<{
  items: readonly T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}>;

export type PageWindow = Readonly<{
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  offset: number;
}>;

export function parsePageParam(value: unknown): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || !/^\d+$/.test(candidate)) return 1;
  const page = Number(candidate);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function isCanonicalPageParam(
  value: string | readonly string[] | undefined,
  page: number,
): boolean {
  if (typeof value !== 'string') return value === undefined && page === 1;
  return page > 1 && value === String(page);
}

export function getPageWindow(
  requestedPage: number,
  total: number,
  requestedPageSize = LIBRARY_PAGE_SIZE,
): PageWindow {
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(MAX_LIBRARY_PAGE_SIZE, Math.max(1, Math.trunc(requestedPageSize)))
    : LIBRARY_PAGE_SIZE;
  const normalizedTotal = Number.isFinite(total)
    ? Math.max(0, Math.trunc(total))
    : 0;
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / pageSize));
  const normalizedRequestedPage = Number.isFinite(requestedPage) && requestedPage > 0
    ? Math.trunc(requestedPage)
    : 1;
  const page = Math.min(normalizedRequestedPage, totalPages);

  return {
    page,
    pageSize,
    total: normalizedTotal,
    totalPages,
    offset: (page - 1) * pageSize,
  };
}
