/** Pure series-prefix extraction shared by query service and tests. */
export function extractSeriesPrefix(title: string | null | undefined): string | null {
  if (!title) return null;
  const patterns = [
    /\s*[#＃]\s*\d+\s*$/,
    /\s+\d+\s*$/,
    /\s*第\s*\d+\s*[話巻卷部章集]?\s*$/,
    /\s*[Vv]ol\.?\s*\d+\s*$/,
    /\s*[Ee]pisode\s*\d+\s*$/,
    /\s*Part\s*\d+\s*$/i,
    /\s*(前編|後編|上|中|下|前篇|後篇)\s*$/,
  ];
  for (const pattern of patterns) {
    if (pattern.test(title)) {
      const stripped = title.replace(pattern, '').trim();
      if (stripped.length >= 2) return stripped;
    }
  }
  return null;
}

export function escapeLike(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Cap series prefix length to keep LIKE patterns efficient. */
export function seriesPrefixCandidates(
  title: string | null | undefined,
  titleJapanese: string | null | undefined,
  maxLength = 15,
): string[] {
  return [extractSeriesPrefix(title), extractSeriesPrefix(titleJapanese)]
    .filter((prefix): prefix is string => !!prefix && prefix.length >= 2)
    .map((prefix) => prefix.slice(0, maxLength));
}

export function normalizeListQuery(input: {
  page?: number;
  limit?: number;
  sort?: 'latest' | 'popular';
  activeOnly?: boolean;
}): {
  page: number;
  limit: number;
  sort: 'latest' | 'popular';
  activeOnly: boolean;
  offset: number;
} {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 48));
  return {
    page,
    limit,
    sort: input.sort === 'popular' ? 'popular' : 'latest',
    activeOnly: input.activeOnly !== false,
    offset: (page - 1) * limit,
  };
}

export function isActiveRow(isActive: number | null | undefined): boolean {
  return isActive === 1 || isActive === null || isActive === undefined;
}
