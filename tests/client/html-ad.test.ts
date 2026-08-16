import assert from 'node:assert/strict';
import test from 'node:test';
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
