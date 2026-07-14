/**
 * Deterministic media object keys for staging and final publish paths.
 * Prefix/layout is storage-config driven; keys must be stable for a given
 * job/attempt/item/asset so crash recovery can reconcile without guessing.
 */
export function buildMediaObjectKeys(input: {
  prefix?: string;
  jobId: number;
  attemptId: number;
  itemKey: string;
  assetKind: 'video' | 'cover' | 'fanart' | 'other';
  organizeByDate?: boolean;
  now?: Date;
}): Readonly<{ stagingKey: string; finalKey: string }> {
  const prefix = normalizePrefix(input.prefix ?? '');
  const safeItem = sanitizePathSegment(input.itemKey);
  const datePart = input.organizeByDate === false
    ? ''
    : `${formatUtcDate(input.now ?? new Date())}/`;
  const base = `${prefix}${datePart}job-${input.jobId}/attempt-${input.attemptId}/${input.assetKind}/${safeItem}`;
  return {
    stagingKey: `staging/${base}`,
    finalKey: `final/${base}`,
  };
}

export function assertSafeObjectPrefix(prefix: string): string {
  const trimmed = prefix.trim();
  if (!trimmed) return '';
  if (
    trimmed.includes('..')
    || trimmed.startsWith('/')
    || trimmed.startsWith('\\')
    || /^[a-zA-Z]:/.test(trimmed)
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
  ) {
    throw new Error('非法对象前缀');
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function normalizePrefix(prefix: string): string {
  return assertSafeObjectPrefix(prefix);
}

function sanitizePathSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 128) || 'item';
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
