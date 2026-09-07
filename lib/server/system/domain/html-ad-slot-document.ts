import { resolveAdDimensions } from '@/lib/ad-dimensions';
import { buildHtmlAdSrcDoc } from '@/lib/client/html-ad';
import { parseHtmlAdDocumentRef, sanitizeHtmlAdMessageId } from '@/lib/html-ad-document';
import type { PublicAdsConfig } from './settings';

export function buildPublicHtmlAdDocument(
  ads: PublicAdsConfig,
  parts: readonly string[],
  messageId: string,
  options: { fluid?: boolean } = {},
): string | null {
  const ref = parseHtmlAdDocumentRef(parts);
  if (!ref) return null;
  const mid = sanitizeHtmlAdMessageId(messageId);
  if (ref.kind === 'feed') {
    const slot = ads.feedSlots[ref.id];
    if (!slot?.html.trim()) return null;
    return options.fluid
      ? buildHtmlAdSrcDoc(slot.html, mid, {}, '', true)
      : buildHtmlAdSrcDoc(slot.html, mid, resolveAdDimensions(slot));
  }
  if (ref.kind === 'reader') {
    const slot = ads.reader[ref.id];
    if (!slot?.html.trim()) return null;
    return buildHtmlAdSrcDoc(slot.html, mid, resolveAdDimensions(slot));
  }
  const ad = ref.id === 'preroll' ? ads.player.preRollAd : ads.player.pauseAd;
  if (!ad.enabled || !ad.html.trim()) return null;
  return buildHtmlAdSrcDoc(ad.html, mid, {}, ad.clickUrl);
}
