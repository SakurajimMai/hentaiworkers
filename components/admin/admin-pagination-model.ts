import {
  getPaginationModel,
  type PaginationItem,
  type PaginationModel,
} from '@/components/pagination-model';

export type AdminPaginationItem = PaginationItem;
export type AdminPaginationModel = PaginationModel;

export function getAdminPaginationModel(
  page: number,
  totalPages: number,
): AdminPaginationModel {
  return getPaginationModel(page, totalPages);
}

export function paginateItems<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): {
  page: number;
  total: number;
  totalPages: number;
  items: T[];
} {
  const size = Math.max(1, Math.trunc(pageSize) || 1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  const current = Math.min(totalPages, Math.max(1, Math.trunc(page) || 1));
  const start = (current - 1) * size;
  return {
    page: current,
    total,
    totalPages,
    items: items.slice(start, start + size),
  };
}

export function buildAdminPaginationHref(
  basePath: string,
  page: number,
  query?: Record<string, string | undefined>,
  pageParam = 'page',
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value && key !== pageParam && key !== 'page') params.set(key, value);
  }
  if (page > 1 || pageParam !== 'page') {
    params.set(pageParam, String(page));
  }
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}
