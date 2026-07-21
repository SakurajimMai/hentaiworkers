export type AdminPaginationItem = number | 'ellipsis-start' | 'ellipsis-end';

export type AdminPaginationModel = Readonly<{
  page: number;
  totalPages: number;
  items: readonly AdminPaginationItem[];
}>;

function positiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

export function getAdminPaginationModel(
  page: number,
  totalPages: number,
): AdminPaginationModel {
  const normalizedTotalPages = positiveInteger(totalPages, 1);
  const normalizedPage = Math.min(
    normalizedTotalPages,
    positiveInteger(page, 1),
  );

  let items: AdminPaginationItem[];
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

export function buildAdminPaginationHref(
  basePath: string,
  page: number,
  query?: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value && key !== 'page') params.set(key, value);
  }
  params.set('page', String(page));
  return `${basePath}?${params.toString()}`;
}
