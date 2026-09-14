import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MAX_AD_HEIGHT, feedAdFrameRatio, htmlAdContainScale, htmlAdFitScale, htmlAdFrameScale, htmlAdSlotPaddingBottom, inferAdDimensionsFromHtml, normalizeAdDimensions, resolveAdDimensions } from '../../lib/ad-dimensions';
import { HTML_AD_RUNTIME } from '../../lib/client/html-ad-runtime';
import {
  HTML_AD_MESSAGE_TYPE,
  buildHtmlAdSrcDoc,
  buildPlayerHtmlAd,
  parseHtmlAdSizeMessage,
} from '../../lib/client/html-ad';
import { htmlAdDocumentPath, htmlAdDocumentUrl, parseHtmlAdDocumentRef } from '../../lib/html-ad-document';
import { buildPublicHtmlAdDocument } from '../../lib/server/system/domain/html-ad-slot-document';
import { parseSystemSettings, toPublicAdsConfig } from '../../lib/server/system/domain/settings';

const UNION_SNIPPET = `<script>
    (function () {
        var id = "8225462100335650212-1826";
        document.write('<ins style="display:none!important" id="' + id + '"></ins>');
        (window.adbyunion = window.adbyunion || []).push(id);
    })();
</script>
<script async src="https://k2n2fzb.com:866/o.js"></script>`;

test('html ad srcdoc keeps union scripts and shims document.write', () => {
  const src = buildHtmlAdSrcDoc(UNION_SNIPPET, 'ad-1');
  assert.match(src, /document\.write = function/);
  assert.match(src, /8225462100335650212-1826/);
  assert.match(src, /k2n2fzb\.com:866\/o\.js/);
  assert.match(src, /adbyunion/);
  assert.match(src, /hw-ad-size/);
});

test('html ad size messages accept matching ids only', () => {
  assert.equal(
    parseHtmlAdSizeMessage({ type: HTML_AD_MESSAGE_TYPE, id: 'ad-1', h: 180.2 }, 'ad-1'),
    181,
  );
  assert.equal(
    parseHtmlAdSizeMessage({ type: HTML_AD_MESSAGE_TYPE, id: 'other', h: 180 }, 'ad-1'),
    null,
  );
  assert.equal(parseHtmlAdSizeMessage({ type: 'nope', id: 'ad-1', h: 180 }, 'ad-1'), null);
});

test('ad reports and creative sizes stay bounded and reject invalid numbers', () => {
  for (const h of [Infinity, NaN, -1, 0, '100', {}, null]) {
    assert.equal(parseHtmlAdSizeMessage({ type: HTML_AD_MESSAGE_TYPE, id: 'ad', h }, 'ad'), null);
  }
  assert.equal(parseHtmlAdSizeMessage({ type: HTML_AD_MESSAGE_TYPE, id: 'ad', h: 20000 }, 'ad'), MAX_AD_HEIGHT);
  assert.deepEqual(normalizeAdDimensions({ width: 970, height: 250 }), { width: 970, height: 250 });
  assert.deepEqual(normalizeAdDimensions({ width: 4000, height: 9000 }), { width: 1920, height: 600 });
  assert.deepEqual(normalizeAdDimensions({ width: 970 }), { width: 0, height: 0 });
  assert.deepEqual(normalizeAdDimensions({ width: Infinity, height: 250 }), { width: 0, height: 0 });
  assert.equal(htmlAdSlotPaddingBottom(300, 250), `${(250 / 300) * 100}%`);
  assert.equal(htmlAdFrameScale(300), 'scale(calc(100cqw / 300px))');
  assert.equal(htmlAdFitScale(432, 300), 432 / 300);
  assert.equal(htmlAdFitScale(160, 300), 160 / 300);
  assert.equal(htmlAdFitScale(0, 300), 1);
  assert.equal(feedAdFrameRatio({}), 2 / 3);
  assert.equal(feedAdFrameRatio({ banner: true, width: 300, height: 250 }), 300 / 250);
  assert.equal(htmlAdSlotPaddingBottom(feedAdFrameRatio({}), 1), '150%');
  assert.deepEqual(
    inferAdDimensionsFromHtml(`<script>
      atOptions = {
        'key' : 'abc',
        'format' : 'iframe',
        'height' : 250,
        'width' : 300,
        'params' : {}
      };
    </script>`),
    { width: 300, height: 250 },
  );
  assert.deepEqual(
    inferAdDimensionsFromHtml('<iframe width="728" height="90" src="https://ads.example/x"></iframe>'),
    { width: 728, height: 90 },
  );
  assert.deepEqual(inferAdDimensionsFromHtml('<div class="native"></div>'), { width: 0, height: 0 });
  assert.deepEqual(
    inferAdDimensionsFromHtml('<a href="https://ads.example/go" target="_blank"><img src="https://cdn.example/300x250.jpg" width="300" height="250" alt=""></a>'),
    { width: 300, height: 250 },
    'plain image creatives expose their pixel size',
  );
  assert.deepEqual(
    inferAdDimensionsFromHtml('<a href="https://ads.example/go"><img src="https://cdn.example/b.png" style="width:300px;height:450px;display:block"></a>'),
    { width: 300, height: 450 },
  );
  assert.deepEqual(
    inferAdDimensionsFromHtml('<img src="https://cdn.example/fluid.png" width="100%" data-width="300" data-height="250">'),
    { width: 0, height: 0 },
    'percentage and data-* sizes stay automatic',
  );
  // The lookahead must span the remaining digits, or the engine backtracks and reads 100% as 10px.
  assert.deepEqual(
    inferAdDimensionsFromHtml('<a><img src="https://cdn.example/a.png" width="100%" height="100%"></a>'),
    { width: 0, height: 0 },
    'a fully responsive image never becomes a 10 pixel fixed creative',
  );
  assert.deepEqual(
    inferAdDimensionsFromHtml('<iframe width="100%" height="250" src="https://ads.example/x"></iframe>'),
    { width: 0, height: 0 },
    'a percentage on either axis keeps the slot automatic',
  );
  // Snippets routinely carry a badge, logo or tracking pixel before the real unit.
  assert.deepEqual(
    inferAdDimensionsFromHtml('<div><img src="badge.png" width="15" height="15"><script src="n.js"></script><a><img src="b.png" width="300" height="250"></a></div>'),
    { width: 300, height: 250 },
    'the largest sized element wins, not the first one',
  );
  assert.deepEqual(
    inferAdDimensionsFromHtml('<a><img width="24" height="24"></a><a><img width="300" height="250"></a>'),
    { width: 300, height: 250 },
  );
  // Inferred sizes keep the creative's real shape; clamping one axis would invent a ratio and the
  // 2:3 card would crop exactly what contain promises to letterbox.
  assert.deepEqual(
    inferAdDimensionsFromHtml('<a><img width="600" height="900"></a>'),
    { width: 400, height: 600 },
    'a tall creative is scaled proportionally into the bounds',
  );
  assert.deepEqual(inferAdDimensionsFromHtml('<img width="300" height="1050">'), { width: 171, height: 600 });
  assert.deepEqual(inferAdDimensionsFromHtml('<video width="640" height="360" src="https://cdn.example/a.mp4"></video>'), { width: 640, height: 360 });
  assert.equal(htmlAdContainScale(230, 345, 300, 250), 230 / 300, '300x250 in a poster cell is width-limited');
  assert.equal(htmlAdContainScale(230, 345, 300, 600), 345 / 600, '300x600 in a poster cell is height-limited');
  assert.equal(htmlAdContainScale(230, 0, 300, 250), 230 / 300, 'unknown slot height falls back to width fit');
  assert.equal(htmlAdContainScale(0, 345, 300, 250), 1);
  assert.deepEqual(
    resolveAdDimensions({
      width: 0,
      height: 0,
      html: "atOptions = { 'width': 300, 'height': 250 }",
    }),
    { width: 300, height: 250 },
  );
  assert.deepEqual(resolveAdDimensions({ width: 320, height: 50, html: "width: 300, height: 250" }), {
    width: 320,
    height: 50,
  });
});

test('Android packages the same independently owned ad runtime covered by browser tests', () => {
  const native = readFileSync('mobile/android/app/src/main/assets/html-ad-runtime.js', 'utf8');
  assert.equal(native.trim(), HTML_AD_RUNTIME.trim());
  assert.match(native, /adoptOrphans/);
  assert.match(native, /Node\.prototype\.appendChild/);
});

test('html ad documents resolve same-origin https paths for alliance scripts', () => {
  assert.equal(htmlAdDocumentPath({ kind: 'feed', id: 0 }), '/ads/html/feed/0');
  assert.equal(htmlAdDocumentPath({ kind: 'reader', id: 'top' }), '/ads/html/reader/top');
  assert.equal(htmlAdDocumentPath({ kind: 'player', id: 'pause' }), '/ads/html/player/pause');
  assert.equal(htmlAdDocumentUrl('/ads/html/feed/0', ':r1:'), '/ads/html/feed/0?mid=r1');
  assert.match(htmlAdDocumentUrl('/ads/html/feed/0', 'ad-1', { fluid: true }), /fluid=1/);
  assert.match(buildHtmlAdSrcDoc('<p>x</p>', 'ad', {}, '', true), /"fill":true/);
  assert.match(HTML_AD_RUNTIME, /config\.fill/);
  assert.match(HTML_AD_RUNTIME, /style\.transform = 'none'/);
  assert.deepEqual(parseHtmlAdDocumentRef(['feed', '0']), { kind: 'feed', id: 0 });
  assert.equal(parseHtmlAdDocumentRef(['reader', 'middle']), null);
  assert.equal(parseHtmlAdDocumentRef(['feed', '12']), null);

  const ads = toPublicAdsConfig(
    parseSystemSettings({
      ads: {
        feedSlots: [{ enabled: true, html: '<script>atOptions={}</script>', width: 300, height: 250 }],
        reader: { top: { enabled: true, html: '<p>top</p>' } },
      },
      player: { pauseAd: { enabled: true, html: '<div>pause</div>', clickUrl: 'https://x.example' } },
    }),
  );
  const feed = buildPublicHtmlAdDocument(ads, ['feed', '0'], 'ad-1');
  assert.match(String(feed), /atOptions=\{\}/);
  assert.match(String(feed), /"id":"ad-1"/);
  assert.match(String(feed), /width:300px/);
  const fluid = buildPublicHtmlAdDocument(ads, ['feed', '0'], 'ad-1', { fluid: true });
  assert.match(String(fluid), /width:100%;min-height:0;height:100%/);
  assert.doesNotMatch(String(fluid), /width:300px/);
  assert.match(String(buildPublicHtmlAdDocument(ads, ['reader', 'top'], 'r')), /<p>top<\/p>/);
  assert.match(String(buildPublicHtmlAdDocument(ads, ['player', 'pause'], 'player-ad')), /https:\/\/x\.example/);
  assert.equal(buildPublicHtmlAdDocument(ads, ['feed', '3'], 'ad'), null);
});

test('player html ads can load a same-origin document instead of srcdoc', () => {
  const framed = buildPlayerHtmlAd('<b>ad</b>', 'https://x.example', '/ads/html/player/preroll');
  assert.match(framed, /data-html-ad-src="\/ads\/html\/player\/preroll\?mid=player-ad"/);
  assert.doesNotMatch(framed, /<b>ad<\/b>/);
  assert.match(buildPlayerHtmlAd('<b>ad</b>'), /<b>ad<\/b>/);
});
