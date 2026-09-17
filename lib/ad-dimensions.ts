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
 * Scale an inferred creative into the bounded viewport without distorting it.
 * Explicit admin sizes clamp each axis independently (a documented limit), but an inferred
 * size is the creative's real shape: clamping one axis alone would invent a wrong ratio and
 * the 2:3 card would then crop what it promises to letterbox.
 */
function fitInferredDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(1, MAX_AD_WIDTH / width, MAX_AD_HEIGHT / height);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
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
    const sized = fitInferredDimensions(
      optionNumber(atBlock[0], 'width'),
      optionNumber(atBlock[0], 'height'),
    );
    if (sized.width > 0) return sized;
  }
  // Sized embeds and plain image creatives (`<a><img width height></a>`) expose their pixels the
  // same way. A snippet routinely carries a badge, logo or tracking pixel before the real unit,
  // so take the largest sized element rather than whichever appears first.
  let best = { width: 0, height: 0 };
  for (const tag of ['iframe', 'img', 'video']) {
    for (const element of text.matchAll(new RegExp(`<${tag}\\b[^>]{0,500}>`, 'gi'))) {
      const sized = fitInferredDimensions(
        attributeNumber(element[0], 'width'),
        attributeNumber(element[0], 'height'),
      );
      if (sized.width * sized.height > best.width * best.height) best = sized;
    }
  }
  return best;
}

/**
 * Pixel value of `width="300"` / `style="width:300px"`.
 * Percentages stay automatic: the lookahead has to span the remaining digits, otherwise the
 * engine backtracks and reads `100%` as a 10 pixel creative.
 */
function attributeNumber(tag: string, name: string): number {
  const attribute = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']?(\\d{2,4})(?![\\d\\s]*%)`, 'i'));
  if (attribute) return Number(attribute[1]);
  const style = tag.match(new RegExp(`[\\s;"']${name}\\s*:\\s*(\\d{2,4})px`, 'i'));
  return style ? Number(style[1]) : 0;
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

/** Fit a creative CSS-pixel viewport into a slot. Fixed creatives may scale to fit the available slot. */
export function htmlAdFitScale(slotWidth: number, creativeWidth: number): number {
  if (!(slotWidth > 0) || !(creativeWidth > 0)) return 1;
  return slotWidth / creativeWidth;
}

/**
 * Letterbox a fixed creative inside a poster cell: it fills the shorter dimension and is never
 * cropped, so a 300×250 unit sits centred in a 2:3 card and a 300×600 skyscraper fits its height.
 */
export function htmlAdContainScale(
  slotWidth: number,
  slotHeight: number,
  creativeWidth: number,
  creativeHeight: number,
): number {
  const byWidth = htmlAdFitScale(slotWidth, creativeWidth);
  if (!(slotHeight > 0) || !(creativeHeight > 0)) return byWidth;
  return Math.min(byWidth, slotHeight / creativeHeight);
}
