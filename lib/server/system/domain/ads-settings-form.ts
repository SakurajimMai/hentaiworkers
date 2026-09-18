import { MAX_FEED_ADS, type FeedAdSlot } from './settings';
import { normalizeAdDimensions } from '@/lib/ad-dimensions';

/**
 * Pure admin form parser for native feed + manga-reader ads.
 */
export function parseAdsSettingsFromForm(formData: FormData) {
  return {
    feedSlots: parseFeedSlotsFromForm(formData),
    reader: {
      top: {
        ...parseDimensions(formData, 'adsReaderTop'),
        enabled: formData.get('adsReaderTopEnabled') === '1',
        html: String(formData.get('adsReaderTopHtml') || '').slice(0, 20000),
        interval: 5,
      },
      middle: {
        enabled: false,
        html: '',
        interval: 5,
      },
      bottom: {
        ...parseDimensions(formData, 'adsReaderBottom'),
        enabled: formData.get('adsReaderBottomEnabled') === '1',
        html: String(formData.get('adsReaderBottomHtml') || '').slice(0, 20000),
        interval: 5,
      },
    },
  };
}

function parseDimensions(formData: FormData, prefix: string) {
  return normalizeAdDimensions({
    width: Number(formData.get(`${prefix}Width`)),
    height: Number(formData.get(`${prefix}Height`)),
  });
}

function clampInterval(raw: FormDataEntryValue | string | number | null, fallback: number, max: number): number {
  const parsed = parseInt(String(raw ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function parseFeedSlotsFromForm(formData: FormData): FeedAdSlot[] {
  const json = String(formData.get('adsFeedSlotsJson') || '').trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (Array.isArray(parsed)) {
        const slots = parsed
          .map(sanitizeFeedSlot)
          .filter((slot): slot is FeedAdSlot => slot !== null)
          .slice(0, MAX_FEED_ADS);
        if (slots.length) return slots;
      }
    } catch {
      // Fall back to the legacy single-slot fields below.
    }
  }

  return [
    {
      ...parseDimensions(formData, 'adsFeed'),
      enabled: formData.get('adsFeedEnabled') === '1',
      name: '信息流广告 1',
      interval: clampInterval(formData.get('adsFeedInterval'), 5, 40),
      href: String(formData.get('adsFeedHref') || '').slice(0, 1000),
      html: String(formData.get('adsFeedHtml') || '').slice(0, 20000),
    },
  ];
}

function sanitizeFeedSlot(value: unknown): FeedAdSlot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const text = (key: string, max: number) =>
    typeof raw[key] === 'string' ? (raw[key] as string).slice(0, max) : '';
  return {
    ...normalizeAdDimensions({ width: Number(raw.width), height: Number(raw.height) }),
    enabled: raw.enabled !== false && raw.enabled !== '0',
    name: text('name', 40),
    interval: clampInterval(
      typeof raw.interval === 'number' || typeof raw.interval === 'string' ? raw.interval : '5',
      5,
      40,
    ),
    href: text('href', 1000),
    html: text('html', 20000),
  };
}

export type FeedSlot<T> =
  | { type: 'item'; item: T; key: string }
  | { type: 'ad'; key: string; ad: FeedAdSlot; adIndex: number };

export function feedAdStep(ad: FeedAdSlot): number {
  return Math.max(1, Math.min(40, Math.floor(ad.interval) || 5));
}

/**
 * A feed position carries **one** ad, drawn at random from the slots whose interval lands on it.
 * Six configured creatives therefore rotate through the feed instead of stacking six cards at
 * every position. The draw skips the slot shown at the previous position while another candidate
 * is available, because a creative repeated back to back reads as a broken feed.
 *
 * `pick` is injected so callers and tests can make a rotation deterministic; it receives the
 * candidate count and returns the index to take.
 */
export function interleaveFeedAds<T>(
  items: readonly T[],
  ads: readonly FeedAdSlot[],
  itemKey: (item: T, index: number) => string,
  pick: (count: number) => number = (count) => Math.floor(Math.random() * count),
): FeedSlot<T>[] {
  const slots: FeedSlot<T>[] = [];
  let previous = -1;
  items.forEach((item, index) => {
    slots.push({ type: 'item', item, key: itemKey(item, index) });
    const seen = index + 1;
    const eligible = ads
      .map((ad, adIndex) => ({ ad, adIndex }))
      .filter(({ ad }) => ad.enabled && seen % feedAdStep(ad) === 0);
    if (eligible.length === 0) return;
    const candidates =
      eligible.length > 1 ? eligible.filter(({ adIndex }) => adIndex !== previous) : eligible;
    const drawn = Math.floor(pick(candidates.length));
    const { ad, adIndex } = candidates[
      Number.isFinite(drawn) ? Math.min(candidates.length - 1, Math.max(0, drawn)) : 0
    ];
    previous = adIndex;
    slots.push({ type: 'ad', key: `ad-${adIndex}-${seen}`, ad, adIndex });
  });
  return slots;
}
