import assert from 'node:assert/strict';
import test from 'node:test';
import {
  interleaveFeedAds,
  parseAdsSettingsFromForm,
} from '../../lib/server/system/domain/ads-settings-form';
import { parseSystemSettings, toPublicAdsConfig } from '../../lib/server/system/domain/settings';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

test('ads settings default to one enabled feed slot and reader off', () => {
  const settings = parseSystemSettings({});
  assert.equal(settings.ads.feedSlots.length, 1);
  assert.equal(settings.ads.feedSlots[0].enabled, true);
  assert.equal(settings.ads.feedSlots[0].interval, 5);
  assert.equal(settings.ads.reader.top.enabled, false);
  assert.equal(settings.ads.reader.middle.enabled, false);
  assert.equal(settings.ads.reader.bottom.enabled, false);
});

test('legacy single feed/mangaReader settings migrate', () => {
  const settings = parseSystemSettings({
    ads: {
      feed: { enabled: true, interval: 8, href: 'https://a.example', html: '<b>a</b>' },
      mangaReader: { enabled: true, interval: 3, html: '<p>mid</p>' },
    },
  });
  assert.equal(settings.ads.feedSlots.length, 1);
  assert.equal(settings.ads.feedSlots[0].interval, 8);
  assert.equal(settings.ads.feedSlots[0].html, '<b>a</b>');
  assert.equal(settings.ads.reader.middle.enabled, true);
  assert.equal(settings.ads.reader.middle.interval, 3);
  assert.equal(settings.ads.reader.top.enabled, false);
});

test('parseAdsSettingsFromForm reads multiple feed slots and reader positions', () => {
  const parsed = parseAdsSettingsFromForm(
    form({
      adsFeedSlotsJson: JSON.stringify([
        { enabled: true, name: 'A', interval: 4, href: 'https://a.example', html: '<div>a</div>' },
        { enabled: false, name: 'B', interval: 9, href: '', html: '<div>b</div>' },
      ]),
      adsReaderTopEnabled: '1',
      adsReaderTopHtml: '<p>top</p>',
      adsReaderBottomEnabled: '1',
      adsReaderBottomHtml: '<p>bottom</p>',
    }),
  );
  assert.equal(parsed.feedSlots.length, 2);
  assert.equal(parsed.feedSlots[0].interval, 4);
  assert.equal(parsed.feedSlots[1].enabled, false);
  assert.equal(parsed.reader.top.html, '<p>top</p>');
  assert.equal(parsed.reader.middle.enabled, false);
  assert.equal(parsed.reader.bottom.enabled, true);
});

test('interleaveFeedAds respects each slot interval independently', () => {
  const slots = interleaveFeedAds(
    [1, 2, 3, 4, 5, 6],
    [
      { enabled: true, name: 'A', interval: 2, href: '', html: 'a' },
      { enabled: true, name: 'B', interval: 3, href: '', html: 'b' },
    ],
    (item) => String(item),
  );
  assert.deepEqual(
    slots.map((slot) => (slot.type === 'ad' ? slot.ad.html : slot.item)),
    [1, 2, 'a', 3, 'b', 4, 'a', 5, 6, 'a', 'b'],
  );
});

test('banner dimensions round-trip from the admin form into public ads', () => {
  const parsed = parseAdsSettingsFromForm(form({
    adsFeedSlotsJson: JSON.stringify([{ enabled: true, width: 300, height: 250, html: '<div>feed</div>' }]),
    adsReaderTopEnabled: '1',
    adsReaderTopHtml: '<div>banner</div>',
    adsReaderTopWidth: '728',
    adsReaderTopHeight: '90',
    adsReaderBottomWidth: '9999',
    adsReaderBottomHeight: '9999',
  }));
  const settings = parseSystemSettings({ ads: parsed });
  const publicAds = toPublicAdsConfig(settings);
  assert.equal(publicAds.feedSlots[0].width, 300);
  assert.equal(publicAds.feedSlots[0].height, 250);
  assert.equal(publicAds.reader.top.width, 728);
  assert.equal(publicAds.reader.top.height, 90);
  assert.equal(publicAds.reader.top.html, '<div>banner</div>');
  assert.equal(publicAds.reader.bottom.width, 1920);
  assert.equal(publicAds.reader.bottom.height, 600);
  assert.equal(publicAds.reader.bottom.html, '');
});

test('partial, absent, or invalid banner dimensions select automatic layout', () => {
  const parsed = parseAdsSettingsFromForm(form({
    adsReaderTopWidth: '728',
    adsReaderBottomWidth: 'invalid',
    adsReaderBottomHeight: '90',
  }));
  assert.equal(parsed.reader.top.width, 0);
  assert.equal(parsed.reader.top.height, 0);
  assert.equal(parsed.reader.bottom.width, 0);
  assert.equal(parsed.reader.bottom.height, 0);
  assert.equal(parsed.feedSlots[0].width, 0);
});
