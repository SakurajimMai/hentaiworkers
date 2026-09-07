export const MAX_AD_WIDTH = 1920;
export const MAX_AD_HEIGHT = 600;

export type AdDimensions = { width?: number; height?: number };

export const AD_SIZE_PRESETS = [
  { label: '自动', width: 0, height: 0 },
  { label: '320 × 50', width: 320, height: 50 },
  { label: '320 × 100', width: 320, height: 100 },
  { label: '300 × 250', width: 300, height: 250 },
  { label: '336 × 280', width: 336, height: 280 },
  { label: '468 × 60', width: 468, height: 60 },
  { label: '728 × 90', width: 728, height: 90 },
  { label: '970 × 90', width: 970, height: 90 },
  { label: '970 × 250', width: 970, height: 250 },
  { label: '300 × 600', width: 300, height: 600 },
] as const;

export function normalizeAdDimensions({ width = 0, height = 0 }: AdDimensions = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  return {
    width: Math.min(MAX_AD_WIDTH, Math.max(1, Math.floor(width))),
    height: Math.min(MAX_AD_HEIGHT, Math.max(1, Math.floor(height))),
  };
}

function optionNumber(source: string, key: string): number {
  const match = source.match(new RegExp(`['"]?${key}['"]?\\s*:\\s*['"]?(\\d{2,4})['"]?`, 'i'));
  return match ? Number(match[1]) : 0;
}

/**
 * Read a creative's CSS-pixel viewport from alliance snippets when the admin left size on 自动.
 * atOptions iframe units and explicit iframe width/height must keep that viewport so the script
 * can fill on a narrow mobile slot; the outer frame still scales down.
 */
export function inferAdDimensionsFromHtml(html: string): { width: number; height: number } {
  const text = String(html || '');
  const atBlock = text.match(/atOptions\s*=\s*\{[\s\S]{0,500}?\}/);
  if (atBlock) {
    const sized = normalizeAdDimensions({
      width: optionNumber(atBlock[0], 'width'),
      height: optionNumber(atBlock[0], 'height'),
    });
    if (sized.width > 0) return sized;
  }
  const iframe = text.match(/<iframe\b[^>]{0,500}>/i);
  if (iframe) {
    const width = iframe[0].match(/\bwidth\s*=\s*["']?(\d{2,4})/i);
    const height = iframe[0].match(/\bheight\s*=\s*["']?(\d{2,4})/i);
    const sized = normalizeAdDimensions({
      width: width ? Number(width[1]) : 0,
      height: height ? Number(height[1]) : 0,
    });
    if (sized.width > 0) return sized;
  }
  return { width: 0, height: 0 };
}

export function resolveAdDimensions(slot: AdDimensions & { html?: string } = {}) {
  const explicit = normalizeAdDimensions(slot);
  if (explicit.width > 0) return explicit;
  return inferAdDimensionsFromHtml(slot.html || '');
}

/** Padding-bottom percent that preserves a creative's aspect ratio without `aspect-ratio`. */
export function htmlAdSlotPaddingBottom(width: number, height: number): string {
  return `${(height / width) * 100}%`;
}

/**
 * Scale a full-size creative iframe down to the slot's container width.
 * Layout width stays `creativeWidth` so alliance scripts still see 300×250 (etc.).
 */
export function htmlAdFrameScale(creativeWidth: number): string {
  return `scale(calc(100cqw / ${creativeWidth}px))`;
}

/** Catalog poster ratio (width / height). */
export const FEED_CARD_RATIO = 2 / 3;

/** Width/height ratio used to reserve space for a feed ad before the iframe loads. */
export function feedAdFrameRatio(options: { banner?: boolean; width?: number; height?: number } = {}): number {
  if (options.banner) {
    const size = normalizeAdDimensions(options);
    if (size.width > 0) return size.width / size.height;
    return 300 / 250;
  }
  return FEED_CARD_RATIO;
}
