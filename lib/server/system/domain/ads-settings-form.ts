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
      placement: String(formData.get('adsFeedHtml') || '').trim() ? 'banner' : 'card',
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
    placement:
      raw.placement === 'banner' || raw.placement === 'card'
        ? raw.placement
        : text('html', 20000).trim()
          ? 'banner'
          : 'card',
  };
}

export type FeedSlot<T> =
  | { type: 'item'; item: T; key: string }
  | { type: 'ad'; key: string; ad: FeedAdSlot; adIndex: number };

export function isFeedBannerAd(ad: Pick<FeedAdSlot, 'placement'>): boolean {
  return ad.placement === 'banner';
}

/** Two poster columns so a 300×250 unit aligns with the catalog grid on mobile and desktop. */
export const FEED_BANNER_GRID_CLASS = 'col-span-2';

export function interleaveFeedAds<T>(
  items: readonly T[],
  ads: readonly FeedAdSlot[],
  itemKey: (item: T, index: number) => string,
  include: (ad: FeedAdSlot, index: number) => boolean = () => true,
): FeedSlot<T>[] {
  const slots: FeedSlot<T>[] = [];
  items.forEach((item, index) => {
    slots.push({ type: 'item', item, key: itemKey(item, index) });
    const seen = index + 1;
    ads.forEach((ad, adIndex) => {
      if (!ad.enabled || !include(ad, adIndex)) return;
      const step = Math.max(1, Math.min(40, Math.floor(ad.interval) || 5));
      if (seen % step === 0) {
        slots.push({ type: 'ad', key: `ad-${adIndex}-${seen}`, ad, adIndex });
      }
    });
  });
  return slots;
}
