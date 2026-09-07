export const HTML_AD_DOCUMENT_BASE = '/ads/html';

export type HtmlAdDocumentKind = 'feed' | 'reader' | 'player';

export type HtmlAdDocumentRef =
  | { kind: 'feed'; id: number }
  | { kind: 'reader'; id: 'top' | 'bottom' }
  | { kind: 'player'; id: 'preroll' | 'pause' };

export function sanitizeHtmlAdMessageId(raw: string | null | undefined): string {
  const trimmed = String(raw || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return trimmed || 'ad';
}

export function htmlAdDocumentPath(ref: HtmlAdDocumentRef): string {
  return `${HTML_AD_DOCUMENT_BASE}/${ref.kind}/${ref.id}`;
}

export function htmlAdDocumentUrl(
  path: string,
  messageId: string,
  options: { fluid?: boolean } = {},
): string {
  const params = new URLSearchParams();
  params.set('mid', sanitizeHtmlAdMessageId(messageId));
  if (options.fluid) params.set('fluid', '1');
  return `${path}${path.includes('?') ? '&' : '?'}${params}`;
}

export function parseHtmlAdDocumentRef(parts: readonly string[]): HtmlAdDocumentRef | null {
  if (parts.length !== 2) return null;
  const [kind, id] = parts;
  if (kind === 'feed') {
    if (!/^\d{1,2}$/.test(id)) return null;
    const index = Number(id);
    if (!Number.isInteger(index) || index < 0 || index > 11) return null;
    return { kind: 'feed', id: index };
  }
  if (kind === 'reader' && (id === 'top' || id === 'bottom')) return { kind: 'reader', id };
  if (kind === 'player' && (id === 'preroll' || id === 'pause')) return { kind: 'player', id };
  return null;
}
