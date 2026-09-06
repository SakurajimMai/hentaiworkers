import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPauseAdBody,
  buildPreRollHtml,
  buildPreRollPluginOption,
  clampAdDurations,
  escapeHtmlAttr,
  PAUSE_AD_SEEK_GRACE_MS,
  shouldEnablePreRollPlugin,
  shouldShowPauseAdOnPause,
} from '../../lib/client/player-ads';

test('clampAdDurations keeps total >= play and fills defaults', () => {
  assert.deepEqual(clampAdDurations(5, 10), { playDuration: 5, totalDuration: 10 });
  assert.deepEqual(clampAdDurations(12, 5), { playDuration: 12, totalDuration: 12 });
  assert.deepEqual(clampAdDurations(0, 0), { playDuration: 0, totalDuration: 5 });
  assert.deepEqual(clampAdDurations(-3, 200), { playDuration: 0, totalDuration: 180 });
});

test('clampAdDurations floors floats, caps play at 120, and fills total when play>0', () => {
  assert.deepEqual(clampAdDurations(3.9, 0), { playDuration: 3, totalDuration: 5 });
  assert.deepEqual(clampAdDurations(8.2, -1), { playDuration: 8, totalDuration: 8 });
  assert.deepEqual(clampAdDurations(121, 50), { playDuration: 120, totalDuration: 120 });
  assert.deepEqual(clampAdDurations(Number.NaN, Number.NaN), {
    playDuration: 0,
    totalDuration: 5,
  });
});

test('buildPreRollHtml prefers custom html then image', () => {
  const custom = buildPreRollHtml({ html: '<b>ad</b>', imageUrl: 'https://x/a.jpg' });
  assert.match(custom, /^<iframe/);
  assert.match(custom, /<b>ad<\/b>/);
  assert.doesNotMatch(custom, /https:\/\/x\/a\.jpg/);
  const img = buildPreRollHtml({ html: '', imageUrl: 'https://x/a.jpg?q="1"' });
  assert.match(img, /art-preroll-image/);
  assert.match(img, /https:\/\/x\/a\.jpg\?q=&quot;1&quot;/);
  assert.equal(buildPreRollHtml({ html: '', imageUrl: '' }), '');
});

test('shouldEnablePreRollPlugin requires enabled content', () => {
  assert.equal(
    shouldEnablePreRollPlugin({
      enabled: false,
      videoUrl: 'https://x/a.mp4',
      imageUrl: '',
      html: '',
      clickUrl: '',
      playDuration: 5,
      totalDuration: 10,
      muted: true,
    }),
    false,
  );
  assert.equal(
    shouldEnablePreRollPlugin({
      enabled: true,
      videoUrl: '',
      imageUrl: 'https://x/a.jpg',
      html: '',
      clickUrl: '',
      playDuration: 5,
      totalDuration: 10,
      muted: true,
    }),
    true,
  );
  assert.equal(
    shouldEnablePreRollPlugin({
      enabled: true,
      videoUrl: '   ',
      imageUrl: '\t',
      html: '  ',
      clickUrl: '',
      playDuration: 5,
      totalDuration: 10,
      muted: true,
    }),
    false,
  );
});

test('buildPauseAdBody prefers video then html then image', () => {
  const video = buildPauseAdBody({
    enabled: true,
    videoUrl: 'https://cdn.example/p.mp4',
    imageUrl: 'https://cdn.example/p.jpg',
    html: '<div>x</div>',
    clickUrl: '',
    muted: true,
  });
  assert.match(video, /art-pause-ad-video/);
  assert.match(video, / muted/);

  const unmuted = buildPauseAdBody({
    enabled: true,
    videoUrl: 'https://cdn.example/p.mp4?x="1"',
    imageUrl: '',
    html: '',
    clickUrl: '',
    muted: false,
  });
  assert.match(unmuted, /src="https:\/\/cdn\.example\/p\.mp4\?x=&quot;1&quot;"/);
  assert.doesNotMatch(unmuted, / muted/);

  const html = buildPauseAdBody({
    enabled: true,
    videoUrl: '',
    imageUrl: 'https://cdn.example/p.jpg',
    html: '<div>pause</div>',
    clickUrl: '',
    muted: true,
  });
  assert.match(html, /<iframe/);
  assert.match(html, /<div>pause<\/div>/);
  assert.doesNotMatch(html, /https:\/\/cdn\.example\/p\.jpg/);

  const image = buildPauseAdBody({
    enabled: true,
    videoUrl: '',
    imageUrl: 'https://cdn.example/p.jpg',
    html: '',
    clickUrl: '',
    muted: false,
  });
  assert.match(image, /art-pause-ad-image/);

  assert.equal(
    buildPauseAdBody({
      enabled: true,
      videoUrl: '  ',
      imageUrl: '',
      html: '',
      clickUrl: '',
      muted: true,
    }),
    '',
  );
});

test('shouldShowPauseAdOnPause blocks during pre-roll, seek, and near end', () => {
  assert.equal(
    shouldShowPauseAdOnPause({
      preRollActive: true,
      preRollDomVisible: false,
      currentTime: 10,
      duration: 100,
    }),
    false,
  );
  assert.equal(
    shouldShowPauseAdOnPause({
      preRollActive: false,
      preRollDomVisible: true,
      currentTime: 10,
      duration: 100,
    }),
    false,
  );
  assert.equal(
    shouldShowPauseAdOnPause({
      preRollActive: false,
      preRollDomVisible: false,
      currentTime: 99.9,
      duration: 100,
    }),
    false,
  );
  assert.equal(
    shouldShowPauseAdOnPause({
      preRollActive: false,
      preRollDomVisible: false,
      currentTime: 12,
      duration: 100,
      seeking: true,
    }),
    false,
  );
  assert.equal(
    shouldShowPauseAdOnPause({
      preRollActive: false,
      preRollDomVisible: false,
      currentTime: 12,
      duration: 100,
      msSinceSeekActivity: 100,
      seekGraceMs: PAUSE_AD_SEEK_GRACE_MS,
    }),
    false,
  );
  assert.equal(
    shouldShowPauseAdOnPause({
      preRollActive: false,
      preRollDomVisible: false,
      currentTime: 12,
      duration: 100,
      seeking: false,
      msSinceSeekActivity: 500,
    }),
    true,
  );
  assert.equal(
    shouldShowPauseAdOnPause({
      preRollActive: false,
      preRollDomVisible: false,
      currentTime: 12,
      duration: 100,
    }),
    true,
  );
});

test('buildPreRollPluginOption uses video priority and chinese i18n', () => {
  const opt = buildPreRollPluginOption({
    enabled: true,
    videoUrl: 'https://cdn.example/ad.mp4',
    imageUrl: 'https://cdn.example/ad.jpg',
    html: '<b>x</b>',
    clickUrl: 'https://example.com',
    playDuration: 3,
    totalDuration: 9,
    muted: false,
  });
  assert.equal(opt.video, 'https://cdn.example/ad.mp4');
  assert.equal(opt.html, '');
  assert.equal(opt.url, 'https://example.com');
  assert.equal(opt.playDuration, 3);
  assert.equal(opt.totalDuration, 9);
  assert.equal(opt.muted, false);
  assert.equal(opt.i18n.close, '关闭广告');
});

test('buildPreRollPluginOption image/html-only leaves video undefined and empty click undefined', () => {
  const htmlOpt = buildPreRollPluginOption({
    enabled: true,
    videoUrl: '',
    imageUrl: 'https://cdn.example/ad.jpg',
    html: '<div>ad</div>',
    clickUrl: '   ',
    playDuration: 2,
    totalDuration: 6,
    muted: true,
  });
  assert.equal(htmlOpt.video, undefined);
  assert.match(htmlOpt.html, /^<iframe/);
  assert.match(htmlOpt.html, /<div>ad<\/div>/);
  assert.equal(htmlOpt.url, undefined);

  const imageOpt = buildPreRollPluginOption({
    enabled: true,
    videoUrl: '',
    imageUrl: 'https://cdn.example/ad.jpg',
    html: '',
    clickUrl: '',
    playDuration: 2,
    totalDuration: 6,
    muted: true,
  });
  assert.equal(imageOpt.video, undefined);
  assert.match(imageOpt.html, /art-preroll-image/);
  assert.equal(imageOpt.url, undefined);
});

test('escapeHtmlAttr escapes quotes and brackets', () => {
  assert.equal(escapeHtmlAttr('a"b<c>'), 'a&quot;b&lt;c&gt;');
});
