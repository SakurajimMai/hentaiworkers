export type PaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

export type PaginationModel = Readonly<{
  page: number;
  totalPages: number;
  items: readonly PaginationItem[];
}>;

export type PaginationQuery = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

export function getPaginationModel(page: number, totalPages: number): PaginationModel {
  const normalizedTotalPages = positiveInteger(totalPages, 1);
  const normalizedPage = Math.min(
    normalizedTotalPages,
    positiveInteger(page, 1),
  );

  let items: PaginationItem[];
  if (normalizedTotalPages <= 7) {
    items = Array.from(
      { length: normalizedTotalPages },
      (_, index) => index + 1,
    );
  } else if (normalizedPage <= 4) {
    items = [1, 2, 3, 4, 5, 'ellipsis-end', normalizedTotalPages];
  } else if (normalizedPage >= normalizedTotalPages - 3) {
    items = [
      1,
      'ellipsis-start',
      normalizedTotalPages - 4,
      normalizedTotalPages - 3,
      normalizedTotalPages - 2,
      normalizedTotalPages - 1,
      normalizedTotalPages,
    ];
  } else {
    items = [
      1,
      'ellipsis-start',
      normalizedPage - 1,
      normalizedPage,
      normalizedPage + 1,
      'ellipsis-end',
      normalizedTotalPages,
    ];
  }

  return {
    page: normalizedPage,
    totalPages: normalizedTotalPages,
    items,
  };
}

export function buildPaginationHref(
  basePath: string,
  page: number,
  query?: PaginationQuery,
  pageParam = 'page',
): string {
  const normalizedPageParam = pageParam.trim() || 'page';
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (key === normalizedPageParam || value === undefined) continue;
    if (typeof value === 'string') {
      params.append(key, value);
      continue;
    }
    for (const item of value) params.append(key, item);
  }

  const normalizedPage = positiveInteger(page, 1);
  if (normalizedPage > 1) {
    params.set(normalizedPageParam, String(normalizedPage));
  }

  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}
