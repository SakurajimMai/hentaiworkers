import { NextResponse } from 'next/server';
import type { PublicAdsConfig } from '@/lib/public-api-types';

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
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
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
