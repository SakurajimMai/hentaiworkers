export const GLOBAL_AD_EXCLUDED_PREFIXES = [
  '/admin',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
] as const;

export function shouldLoadGlobalAdScripts(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !GLOBAL_AD_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function injectGlobalAdHtml(
  name: string,
  html: string,
  doc: Document = document,
): boolean {
  const trimmed = html.trim();
  if (!trimmed || !doc.body) return false;

  const existing = Array.from(doc.querySelectorAll('[data-hw-global-ad]')).some(
    (node) => node.getAttribute('data-hw-global-ad') === name,
  );
  if (existing) return false;

  const host = doc.createElement('div');
  host.setAttribute('data-hw-global-ad', name);
  const fragment = doc.createRange().createContextualFragment(trimmed);
  host.appendChild(fragment);
  doc.body.appendChild(host);
  return true;
}
