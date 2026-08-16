import { useEffect, useMemo, useState } from 'react';
import { adsApi } from './api';
import { FeedAdSlot, PublicAdsConfig } from './types';

export const EMPTY_ADS: PublicAdsConfig = {
  feedSlots: [],
  reader: {
    top: { enabled: false, html: '', interval: 5 },
    middle: { enabled: false, html: '', interval: 5 },
    bottom: { enabled: false, html: '', interval: 5 },
  },
  player: {
    preRollAd: {
      enabled: false,
      videoUrl: '',
      imageUrl: '',
      html: '',
      clickUrl: '',
      playDuration: 5,
      totalDuration: 10,
      muted: true,
    },
    pauseAd: {
      enabled: false,
      videoUrl: '',
      imageUrl: '',
      html: '',
      clickUrl: '',
      muted: true,
    },
  },
};

export type FeedSlot<T> =
  | { type: 'item'; item: T; key: string }
  | { type: 'ad'; key: string; ad: FeedAdSlot };

/** Same interval rule as the website: each enabled slot inserts after every N items. */
export function interleaveFeedAds<T>(
  items: readonly T[],
  ads: readonly FeedAdSlot[],
  itemKey: (item: T, index: number) => string,
): FeedSlot<T>[] {
  const active = ads.filter((ad) => ad.enabled);
  const slots: FeedSlot<T>[] = [];
  items.forEach((item, index) => {
    slots.push({ type: 'item', item, key: itemKey(item, index) });
    const seen = index + 1;
    active.forEach((ad, adIndex) => {
      const step = Math.max(1, Math.min(40, Math.floor(ad.interval) || 5));
      if (seen % step === 0) {
        slots.push({ type: 'ad', key: `ad-${adIndex}-${seen}`, ad });
      }
    });
  });
  return slots;
}

let cached: PublicAdsConfig | null = null;
let inflight: Promise<PublicAdsConfig> | null = null;

export async function loadAdsConfig(force = false): Promise<PublicAdsConfig> {
  if (!force && cached) return cached;
  if (!force && inflight) return inflight;

  inflight = adsApi
    .getAds()
    .then((data) => {
      cached = normalizeAdsConfig(data);
      return cached;
    })
    .catch(() => cached ?? EMPTY_ADS)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

function normalizeAdsConfig(raw: PublicAdsConfig | null | undefined): PublicAdsConfig {
  if (!raw || typeof raw !== 'object') return EMPTY_ADS;
  return {
    feedSlots: Array.isArray(raw.feedSlots)
      ? raw.feedSlots.filter((slot) => slot && slot.enabled !== false)
      : [],
    reader: {
      top: raw.reader?.top ?? EMPTY_ADS.reader.top,
      middle: EMPTY_ADS.reader.middle,
      bottom: raw.reader?.bottom ?? EMPTY_ADS.reader.bottom,
    },
    player: {
      preRollAd: { ...EMPTY_ADS.player.preRollAd, ...raw.player?.preRollAd },
      pauseAd: { ...EMPTY_ADS.player.pauseAd, ...raw.player?.pauseAd },
    },
  };
}

export function useAdsConfig() {
  const [ads, setAds] = useState<PublicAdsConfig>(cached ?? EMPTY_ADS);

  useEffect(() => {
    let live = true;
    loadAdsConfig().then((next) => {
      if (live) setAds(next);
    });
    return () => {
      live = false;
    };
  }, []);

  return ads;
}

export function useCatalogSlots<T>(
  items: readonly T[],
  itemKey: (item: T, index: number) => string,
) {
  const ads = useAdsConfig();
  const slots = useMemo(
    () => interleaveFeedAds(items, ads.feedSlots, itemKey),
    [ads.feedSlots, itemKey, items],
  );
  return { ads, slots };
}

export function readerAdHtml(slot?: { enabled?: boolean; html?: string } | null) {
  if (!slot?.enabled) return '';
  return (slot.html || '').trim();
}
