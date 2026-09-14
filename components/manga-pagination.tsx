export function buildMangaListHref(
  page: number,
  q?: string,
  tag?: string,
  rank?: string,
): string {
  // encodeURIComponent, not URLSearchParams: the sitemap and every tag chip encode a space as
  // %20, and `+` here would make the canonical disagree with the URL that was submitted.
  const parts: string[] = [];
  if (page > 1) parts.push(`page=${encodeURIComponent(String(page))}`);
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (tag) parts.push(`tag=${encodeURIComponent(tag)}`);
  if (rank) parts.push(`rank=${encodeURIComponent(rank)}`);
  return parts.length ? `/manga?${parts.join('&')}` : '/manga';
}
