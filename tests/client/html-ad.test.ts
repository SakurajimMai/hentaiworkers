import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MAX_AD_HEIGHT, normalizeAdDimensions } from '../../lib/ad-dimensions';
import { HTML_AD_RUNTIME } from '../../lib/client/html-ad-runtime';
import {
  HTML_AD_MESSAGE_TYPE,
  buildHtmlAdSrcDoc,
  parseHtmlAdSizeMessage,
} from '../../lib/client/html-ad';

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
});

test('Android packages the same independently owned ad runtime covered by browser tests', () => {
  const native = readFileSync('mobile/android/app/src/main/assets/html-ad-runtime.js', 'utf8');
  assert.equal(native.trim(), HTML_AD_RUNTIME.trim());
});
