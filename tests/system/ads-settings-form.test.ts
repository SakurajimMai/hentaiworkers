import assert from 'node:assert/strict';
import test from 'node:test';
import {
  interleaveFeedAds,
  parseAdsSettingsFromForm,
  withSmartlinkFallback,
} from '../../lib/server/system/domain/ads-settings-form';
import {
  parseSystemSettings,
  toPublicAdsConfig,
  toPublicPlayerConfig,
} from '../../lib/server/system/domain/settings';
import { buildPublicHtmlAdDocument } from '../../lib/server/system/domain/html-ad-slot-document';

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
  assert.equal('placement' in settings.ads.feedSlots[0], false);
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
  assert.equal('placement' in settings.ads.feedSlots[0], false);
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
  assert.equal('placement' in parsed.feedSlots[0], false);
  assert.equal(parsed.feedSlots[1].enabled, false);
  assert.equal(parsed.reader.top.html, '<p>top</p>');
  assert.equal(parsed.reader.middle.enabled, false);
  assert.equal(parsed.reader.bottom.enabled, true);
  assert.equal(parsed.reader.bottom.floating, false);
  assert.equal(parsed.reader.top.floating, false);
});

test('parseAdsSettingsFromForm only lets the bottom reader slot float', () => {
  const parsed = parseAdsSettingsFromForm(
    form({
      adsReaderTopEnabled: '1',
      adsReaderTopHtml: '<p>top</p>',
      adsReaderTopFloating: '1',
      adsReaderBottomEnabled: '1',
      adsReaderBottomHtml: '<script>float()</script>',
      adsReaderBottomFloating: '1',
    }),
  );
  assert.equal(parsed.reader.bottom.floating, true);
  assert.equal(parsed.reader.top.floating, false);
  assert.equal(parsed.reader.middle.floating, false);
});

test('interleaveFeedAds places one slot per position, drawn from the intervals that land there', () => {
  const slots = interleaveFeedAds(
    [1, 2, 3, 4, 5, 6],
    [
      { enabled: true, name: 'A', interval: 2, href: '', html: 'a' },
      { enabled: true, name: 'B', interval: 3, href: '', html: 'b' },
    ],
    (item) => String(item),
    () => 0,
  );
  // Positions 2, 3, 4 and 6 carry an ad; position 6 is the only one both intervals reach, and it
  // still yields a single card.
  assert.deepEqual(
    slots.map((slot) => (slot.type === 'ad' ? slot.ad.html : slot.item)),
    [1, 2, 'a', 3, 'b', 4, 'a', 5, 6, 'b'],
  );
  assert.deepEqual(
    slots.filter((slot) => slot.type === 'ad').map((slot) => slot.key),
    ['ad-0-2', 'ad-1-3', 'ad-0-4', 'ad-1-6'],
  );

  const enabledOnly = interleaveFeedAds([1], [
    { enabled: false, name: 'off', interval: 1, href: '', html: 'off' },
    { enabled: true, name: 'on', interval: 1, href: '', html: 'on' },
  ], String);
  assert.equal(enabledOnly.find((slot) => slot.type === 'ad')?.adIndex, 1);
});

test('six feed creatives rotate instead of stacking, without repeating back to back', () => {
  const ads = Array.from({ length: 6 }, (_, index) => ({
    enabled: true,
    name: `A${index}`,
    interval: 6,
    href: '',
    html: `creative-${index}`,
  }));
  const items = Array.from({ length: 48 }, (_, index) => index + 1);

  const rotated = interleaveFeedAds(items, ads, String, () => 0);
  const shown = rotated.filter((slot) => slot.type === 'ad');
  assert.equal(shown.length, 8, 'one ad per eligible position, not six');
  assert.deepEqual(
    shown.map((slot) => slot.adIndex),
    [0, 1, 0, 1, 0, 1, 0, 1],
    'a picker that always draws the first candidate still alternates, never repeating a slot',
  );
  assert.deepEqual(
    shown.map((slot) => slot.ad.html),
    shown.map((slot) => `creative-${slot.adIndex}`),
    'each position carries the creative it reports',
  );

  // Over many positions an untouched Math.random draw still reaches every configured slot.
  const seen = new Set(
    interleaveFeedAds(Array.from({ length: 600 }, (_, index) => index), ads, String)
      .filter((slot) => slot.type === 'ad')
      .map((slot) => slot.adIndex),
  );
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5]);
});

test('legacy feed placements are removed without losing creatives', () => {
  const migrated = parseSystemSettings({
    ads: { feedSlots: [{ enabled: true, html: '<script src="https://ads.example/invoke.js"></script>' }] },
  });
  assert.equal('placement' in migrated.ads.feedSlots[0], false);

  const empty = parseSystemSettings({
    ads: { feedSlots: [{ enabled: true, html: '' }] },
  });
  assert.equal('placement' in empty.ads.feedSlots[0], false);

  const parsed = parseAdsSettingsFromForm(
    form({
      adsFeedSlotsJson: JSON.stringify([
        { enabled: true, html: '<script></script>', placement: 'banner', width: 300, height: 250 },
        { enabled: true, html: '' },
      ]),
    }),
  );
  assert.equal('placement' in parsed.feedSlots[0], false);
  assert.equal('placement' in parsed.feedSlots[1], false);
  assert.equal(parsed.feedSlots[0].html, '<script></script>');
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

test('a floating bottom reader slot survives the public config and gets a floating ad document', () => {
  const legacy = parseSystemSettings({ ads: { reader: { bottom: { enabled: true, html: '<p>old</p>' } } } });
  assert.equal(legacy.ads.reader.bottom.floating, false, 'settings saved before the option read as not floating');

  const pub = toPublicAdsConfig(
    parseSystemSettings({
      ads: {
        reader: {
          bottom: { enabled: true, html: '<ins id="u"></ins>', interval: 5, width: 640, height: 200, floating: true },
        },
      },
    }),
  );
  assert.equal(pub.reader.bottom.floating, true);
  assert.equal(pub.reader.middle.floating, false);

  const floating = buildPublicHtmlAdDocument(pub, ['reader', 'bottom'], 'mid-1');
  assert.ok(floating);
  assert.match(floating, /"floating":true/);
  assert.match(floating, /"width":0,"height":0/, 'the admin size does not box a floating unit');
  assert.match(floating, /#hw-ad-content\{[^}]*width:100%;min-height:0;height:100%/);

  const inline = buildPublicHtmlAdDocument(
    toPublicAdsConfig(parseSystemSettings({ ads: { reader: { bottom: { enabled: true, html: '<p>x</p>', width: 320, height: 50 } } } })),
    ['reader', 'bottom'],
    'mid-2',
  );
  assert.ok(inline);
  assert.match(inline, /"floating":false/);
  assert.match(inline, /width:320px;height:50px/);
});

test('parseAdsSettingsFromForm parses banners, global scripts and smartlink fields', () => {
  const parsed = parseAdsSettingsFromForm(
    form({
      adsBannerHomeEnabled: '1',
      adsBannerHomeDesktopHtml: '<div>home-d</div>',
      adsBannerHomeMobileHtml: '<div>home-m</div>',
      adsBannerWatchEnabled: '1',
      adsBannerWatchDesktopHtml: '<div>watch-d</div>',
      adsBannerMangaMobileHtml: '<div>manga-m</div>',
      adsSocialBarEnabled: '1',
      adsSocialBarHtml: '<script src="https://ads.example/sb.js"></script>',
      adsPopunderHtml: '<script src="https://ads.example/pop.js"></script>',
      adsSmartlinkEnabled: '1',
      adsSmartlinkUrl: '  https://smart.example/go  ',
    }),
  );

  assert.equal(parsed.banners.home.enabled, true);
  assert.equal(parsed.banners.home.desktopHtml, '<div>home-d</div>');
  assert.equal(parsed.banners.home.mobileHtml, '<div>home-m</div>');
  assert.equal(parsed.banners.watch.enabled, true);
  assert.equal(parsed.banners.watch.desktopHtml, '<div>watch-d</div>');
  assert.equal(parsed.banners.watch.mobileHtml, '');
  assert.equal(parsed.banners.manga.enabled, false);
  assert.equal(parsed.banners.manga.mobileHtml, '<div>manga-m</div>');
  assert.equal(parsed.scripts.socialBar.enabled, true);
  assert.equal(parsed.scripts.socialBar.html, '<script src="https://ads.example/sb.js"></script>');
  assert.equal(parsed.scripts.popunder.enabled, false);
  assert.equal(parsed.scripts.popunder.html, '<script src="https://ads.example/pop.js"></script>');
  assert.equal(parsed.smartlink.enabled, true);
  assert.equal(parsed.smartlink.url, 'https://smart.example/go');
});

test('withSmartlinkFallback fills only empty placeholder slots', () => {
  const slots = [
    { enabled: true, name: 'placeholder', interval: 5, href: '', html: '' },
    { enabled: true, name: 'explicit-href', interval: 5, href: 'https://explicit.example', html: '' },
    { enabled: true, name: 'html-slot', interval: 5, href: '', html: '<div>ad</div>' },
  ];

  assert.deepEqual(withSmartlinkFallback(slots, ''), slots);
  assert.deepEqual(
    withSmartlinkFallback(slots, '  https://smart.example/go  ').map((slot) => slot.href),
    ['https://smart.example/go', 'https://explicit.example', ''],
  );
});

test('toPublicAdsConfig shares single-variant banners, hides disabled scripts and validates smartlink', () => {
  const pub = toPublicAdsConfig(
    parseSystemSettings({
      ads: {
        banners: {
          home: { enabled: true, desktopHtml: '<div>desktop-only</div>', mobileHtml: '' },
          watch: { enabled: true, desktopHtml: '', mobileHtml: '<div>mobile-only</div>' },
          manga: { enabled: false, desktopHtml: '<div>off</div>', mobileHtml: '<div>off-m</div>' },
        },
        scripts: {
          socialBar: { enabled: true, html: '<script src="https://ads.example/sb.js"></script>' },
          popunder: { enabled: false, html: '<script src="https://ads.example/pop.js"></script>' },
        },
        smartlink: { enabled: true, url: '  https://smart.example/direct  ' },
      },
    }),
  );

  assert.deepEqual(pub.banners.home, {
    desktopHtml: '<div>desktop-only</div>',
    mobileHtml: '<div>desktop-only</div>',
  });
  assert.deepEqual(pub.banners.watch, {
    desktopHtml: '<div>mobile-only</div>',
    mobileHtml: '<div>mobile-only</div>',
  });
  assert.deepEqual(pub.banners.manga, { desktopHtml: '', mobileHtml: '' });
  assert.equal(pub.scripts.socialBar, '<script src="https://ads.example/sb.js"></script>');
  assert.equal(pub.scripts.popunder, '');
  assert.equal(pub.smartlinkUrl, 'https://smart.example/direct');

  const invalidSmartlink = toPublicAdsConfig(
    parseSystemSettings({
      ads: { smartlink: { enabled: true, url: 'javascript:alert(1)' } },
    }),
  );
  assert.equal(invalidSmartlink.smartlinkUrl, '');

  const disabledSmartlink = toPublicAdsConfig(
    parseSystemSettings({
      ads: { smartlink: { enabled: false, url: 'https://smart.example/direct' } },
    }),
  );
  assert.equal(disabledSmartlink.smartlinkUrl, '');
});

test('toPublicPlayerConfig uses smartlink as clickUrl fallback without overriding explicit URLs', () => {
  const withFallback = toPublicPlayerConfig(
    parseSystemSettings({
      ads: { smartlink: { enabled: true, url: 'https://smart.example/go' } },
      player: {
        preRollAd: { enabled: true, imageUrl: 'https://cdn.example/pre.jpg', clickUrl: '' },
        pauseAd: {
          enabled: true,
          imageUrl: 'https://cdn.example/pause.jpg',
          clickUrl: 'https://explicit.example/landing',
        },
      },
    }),
  );
  assert.equal(withFallback.preRollAd.clickUrl, 'https://smart.example/go');
  assert.equal(withFallback.pauseAd.clickUrl, 'https://explicit.example/landing');

  const withoutSmartlink = toPublicPlayerConfig(
    parseSystemSettings({
      ads: { smartlink: { enabled: false, url: 'https://smart.example/go' } },
      player: {
        preRollAd: { enabled: true, imageUrl: 'https://cdn.example/pre.jpg', clickUrl: '' },
      },
    }),
  );
  assert.equal(withoutSmartlink.preRollAd.clickUrl, '');
});
