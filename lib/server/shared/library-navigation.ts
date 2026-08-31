const LOCAL_ORIGIN = 'https://local.invalid';

export function normalizeHistoryReturnTo(candidate: string): string {
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/history';
  const url = new URL(candidate, LOCAL_ORIGIN);
  if (url.pathname !== '/history') return '/history';
  url.searchParams.delete('error');
  return `${url.pathname}${url.search}`;
}

export function withHistoryError(candidate: string): string {
  const url = new URL(normalizeHistoryReturnTo(candidate), LOCAL_ORIGIN);
  url.searchParams.set('error', '1');
  return `${url.pathname}${url.search}`;
}
