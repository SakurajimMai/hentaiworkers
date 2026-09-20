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
  options: Readonly<{ fallback?: string; error?: string; ok?: string }> = {},
): string {
  const params = new URLSearchParams();
  if (options.error) params.set('error', options.error);
  if (options.ok) params.set('ok', options.ok);
  params.set('next', normalizePublicNext(candidate, options.fallback ?? '/favorites'));
  return `/login?${params.toString()}`;
}

/**
 * Page that owns the email-code step. The register page runs it inline, so a form posts the page
 * it came from and the action sends the visitor back there; anything else falls back to /register.
 */
export function normalizeVerificationPage(candidate: unknown): string {
  return candidate === '/verify-email' ? '/verify-email' : '/register';
}

export function buildVerificationHref(
  page: unknown,
  options: Readonly<{ email?: string; next?: unknown; error?: string; ok?: string }> = {},
): string {
  const params = new URLSearchParams();
  if (options.email) params.set('email', options.email);
  params.set('next', normalizePublicNext(options.next, '/favorites'));
  if (options.error) params.set('error', options.error);
  if (options.ok) params.set('ok', options.ok);
  return `${normalizeVerificationPage(page)}?${params.toString()}`;
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
