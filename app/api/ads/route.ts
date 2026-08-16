import {
  createAdsDependency,
  createAdsHandler,
  type AdsSettingsServiceLoader,
} from './handler';

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

export const GET = createAdsHandler(loadAdsFromProduction);
