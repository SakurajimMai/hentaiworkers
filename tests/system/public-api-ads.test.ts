import assert from 'node:assert/strict';
import test from 'node:test';
import { toPublicApiAdsConfig } from '../../lib/server/system/domain/public-api-ads';
import { parseSystemSettings, toPublicAdsConfig } from '../../lib/server/system/domain/settings';

test('toPublicApiAdsConfig applies Smartlink fallback, resolves banner dimensions and strips global scripts', () => {
  const pub = toPublicAdsConfig(
    parseSystemSettings({
      ads: {
        feedSlots: [
          { enabled: true, name: 'Placeholder', interval: 5, href: '', html: '' },
          { enabled: true, name: 'Explicit', interval: 5, href: 'https://explicit.example', html: '' },
          { enabled: true, name: 'Html', interval: 5, href: '', html: '<div>creative</div>' },
        ],
        banners: {
          home: {
            enabled: true,
            desktopHtml: `<script>atOptions = { 'width': 728, 'height': 90 };</script>`,
            mobileHtml: `<script>atOptions = { 'width': 320, 'height': 50 };</script>`,
          },
        },
        scripts: {
          socialBar: { enabled: true, html: '<script src="https://ads.example/sb.js"></script>' },
          popunder: { enabled: true, html: '<script src="https://ads.example/pop.js"></script>' },
        },
        smartlink: { enabled: true, url: 'https://smart.example/fallback' },
      },
      player: {
        preRollAd: { enabled: true, videoUrl: 'https://cdn.example/pre.mp4', clickUrl: '' },
        pauseAd: {
          enabled: true,
          imageUrl: 'https://cdn.example/pause.jpg',
          clickUrl: 'https://explicit.example/pause',
        },
      },
    }),
  );

  const apiAds = toPublicApiAdsConfig(pub);
  assert.equal('scripts' in apiAds, false);
  assert.equal(apiAds.smartlinkUrl, 'https://smart.example/fallback');
  assert.equal(apiAds.feedSlots[0].href, 'https://smart.example/fallback');
  assert.equal(apiAds.feedSlots[1].href, 'https://explicit.example');
  assert.equal(apiAds.feedSlots[2].href, '');
  assert.equal(apiAds.player.preRollAd.clickUrl, 'https://smart.example/fallback');
  assert.equal(apiAds.player.pauseAd.clickUrl, 'https://explicit.example/pause');
  assert.deepEqual(apiAds.banners.home, {
    desktopHtml: `<script>atOptions = { 'width': 728, 'height': 90 };</script>`,
    desktopWidth: 728,
    desktopHeight: 90,
    mobileHtml: `<script>atOptions = { 'width': 320, 'height': 50 };</script>`,
    mobileWidth: 320,
    mobileHeight: 50,
  });
});

test('toPublicApiAdsConfig leaves empty href/clickUrl untouched when Smartlink is disabled', () => {
  const pub = toPublicAdsConfig(
    parseSystemSettings({
      ads: {
        feedSlots: [{ enabled: true, name: 'Placeholder', interval: 5, href: '', html: '' }],
        smartlink: { enabled: false, url: 'https://smart.example/fallback' },
      },
      player: {
        preRollAd: { enabled: true, videoUrl: 'https://cdn.example/pre.mp4', clickUrl: '' },
      },
    }),
  );

  const apiAds = toPublicApiAdsConfig(pub);
  assert.equal(apiAds.smartlinkUrl, '');
  assert.equal(apiAds.feedSlots[0].href, '');
  assert.equal(apiAds.player.preRollAd.clickUrl, '');
});
