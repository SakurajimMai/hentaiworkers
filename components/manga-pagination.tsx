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
