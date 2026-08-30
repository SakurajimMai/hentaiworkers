import { NextResponse } from 'next/server';
import type { PublicAdsConfig } from '@/lib/public-api-types';
import { PUBLIC_READ_CACHE_CONTROL } from '@/lib/server/shared/stale-read-cache';

export type PublicAdsLoader = () => Promise<PublicAdsConfig>;
export type AdsSettingsService = {
  getPublicAdsConfig: () => Promise<PublicAdsConfig>;
};
export type AdsSettingsServiceLoader = () => Promise<AdsSettingsService>;

export function createAdsDependency(
  loadService: AdsSettingsServiceLoader,
): PublicAdsLoader {
  return async () => {
    const service = await loadService();
    return service.getPublicAdsConfig();
  };
}

export function createAdsHandler(loadAds: PublicAdsLoader) {
  return async function adsHandler() {
    try {
      const ads = await loadAds();
      return NextResponse.json(ads, {
        headers: {
          'Cache-Control': PUBLIC_READ_CACHE_CONTROL,
        },
      });
    } catch (e) {
      console.error(e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed' },
        { status: 500 },
      );
    }
  };
}
