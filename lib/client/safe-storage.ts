/**
 * The document's localStorage, or null when the browser refuses access. Reading the property
 * itself throws once cookies or site data are blocked, so a `typeof window.localStorage` check is
 * not a guard — it is the crash. Callers degrade (no history, no remembered theme) instead of
 * taking the page down.
 */
export function localStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Same contract for sessionStorage, which the catalog return-position code relies on. */
export function sessionStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}
