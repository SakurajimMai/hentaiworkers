import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rewriteCdnUrl } from '../mobile/services/media';

describe('manga image CDN rewrite', () => {
  it('proxies Cloudflare imgbed URLs through the site origin', () => {
    assert.equal(
      rewriteCdnUrl(
        'https://image.ixacg.de/file/1787838438761_1111765.jpg',
        'https://www.ixacg.de',
      ),
      'https://www.ixacg.de/cdn-img/file/1787838438761_1111765.jpg',
    );
  });

  it('leaves other hosts unchanged', () => {
    assert.equal(
      rewriteCdnUrl('https://static.hxsl.org/cover.jpg', 'https://www.ixacg.de'),
      'https://static.hxsl.org/cover.jpg',
    );
  });
});
