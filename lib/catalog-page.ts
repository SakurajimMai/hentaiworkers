/**
 * Turn "how many works sort before this one" into the 1-based listing page that holds it.
 *
 * Detail pages use this to link back to the page the visitor came from instead of dropping them
 * on page 1. Both catalogs share it so the 里番 and 漫画 listings cannot drift apart.
 */
export function catalogPageForPrecedingCount(precedingCount: number, pageSize: number): number {
  if (!Number.isFinite(precedingCount) || precedingCount <= 0) return 1;
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.trunc(pageSize)) : 1;
  return Math.floor(Math.trunc(precedingCount) / size) + 1;
}
