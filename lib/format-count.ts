/**
 * Compact counts for browse and detail surfaces: 999 stays 999, 1000 becomes 1k, 7887 becomes
 * 7.8k and 32000 becomes 3.2w (万). Values are truncated rather than rounded, so a displayed
 * number never claims more than the real count.
 *
 * Admin tables keep the exact number; this is for reader-facing text only.
 */
const THOUSAND = 1_000;
const TEN_THOUSAND = 10_000;

function truncateToOneDecimal(value: number): string {
  const truncated = Math.floor(value * 10) / 10;
  return Number.isInteger(truncated) ? String(truncated) : truncated.toFixed(1);
}

export function formatCompactCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '0';
  const count = Math.floor(value);
  if (count < THOUSAND) return String(count);
  if (count < TEN_THOUSAND) return `${truncateToOneDecimal(count / THOUSAND)}k`;
  return `${truncateToOneDecimal(count / TEN_THOUSAND)}w`;
}
