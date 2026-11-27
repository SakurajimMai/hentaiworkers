import type { PublicAdsConfig as ApiPublicAdsConfig } from '@/lib/public-api-types';
import { withSmartlinkFallback } from './ads-settings-form';
import type { PublicAdsConfig } from './settings';

export function toPublicApiAdsConfig(ads: PublicAdsConfig): ApiPublicAdsConfig {
  const smartlink = ads.smartlinkUrl.trim();
  return {
    feedSlots: withSmartlinkFallback(ads.feedSlots, smartlink),
    reader: ads.reader,
    player: {
      preRollAd: {
        ...ads.player.preRollAd,
        clickUrl: ads.player.preRollAd.clickUrl.trim() || smartlink,
      },
      pauseAd: {
        ...ads.player.pauseAd,
        clickUrl: ads.player.pauseAd.clickUrl.trim() || smartlink,
      },
    },
    banners: {
      home: { ...ads.banners.home },
      watch: { ...ads.banners.watch },
      manga: { ...ads.banners.manga },
    },
    smartlinkUrl: smartlink,
  };
}
