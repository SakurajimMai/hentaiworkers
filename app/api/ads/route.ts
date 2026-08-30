import {
  createAdsDependency,
  createAdsHandler,
  type AdsSettingsServiceLoader,
  type PublicAdsLoader,
} from './handler';
import type { PublicAdsConfig } from '@/lib/public-api-types';
import { createPublicReadCache } from '@/lib/server/shared/stale-read-cache';

export const dynamic = 'force-dynamic';

const loadAdsService: AdsSettingsServiceLoader = async () => {
  const { getSystemSettingsService } = await import('@/lib/server/system');
  return {
    getPublicAdsConfig: async () => {
      const ads = await getSystemSettingsService().getPublicAdsConfig();
      return {
        feedSlots: [...ads.feedSlots],
        reader: ads.reader,
        player: ads.player,
      };
    },
  };
};

const loadAdsFromProduction = createAdsDependency(loadAdsService);
const adsCache = createPublicReadCache<PublicAdsConfig>(1, (error) => {
  console.error('[api/ads] background cache refresh failed', error);
});
const loadAdsWithCache: PublicAdsLoader = () =>
  adsCache.get('ads', loadAdsFromProduction);

export const GET = createAdsHandler(loadAdsWithCache);
