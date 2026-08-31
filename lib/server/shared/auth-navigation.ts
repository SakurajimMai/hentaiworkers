const LOCAL_ORIGIN = 'https://local.invalid';

export function normalizePublicNext(candidate: unknown, fallback: string): string {
  if (
    typeof candidate !== 'string'
    || !candidate.startsWith('/')
    || candidate.startsWith('//')
    || candidate.includes('\\')
  ) {
    return fallback;
  }

  try {
    const url = new URL(candidate, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return fallback;
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function buildPublicLoginHref(
  candidate: unknown,
  options: Readonly<{ fallback?: string; error?: string }> = {},
): string {
  const params = new URLSearchParams();
  if (options.error) params.set('error', options.error);
  params.set('next', normalizePublicNext(candidate, options.fallback ?? '/favorites'));
  return `/login?${params.toString()}`;
}

export function buildPublicRegisterHref(
  candidate: unknown,
  options: Readonly<{ fallback?: string; error?: string }> = {},
): string {
  const params = new URLSearchParams();
  if (options.error) params.set('error', options.error);
  params.set('next', normalizePublicNext(candidate, options.fallback ?? '/favorites'));
  return `/register?${params.toString()}`;
}
