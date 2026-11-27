import assert from 'node:assert/strict';
import test from 'node:test';
import {
  injectGlobalAdHtml,
  shouldLoadGlobalAdScripts,
} from '../../lib/client/global-ad-scripts';

test('shouldLoadGlobalAdScripts allows public viewing routes and excludes auth/admin routes', () => {
  for (const allowed of ['/', '/watch/1', '/browse', '/manga', '/manga/a/read/1', '/loginx', '/adminx']) {
    assert.equal(shouldLoadGlobalAdScripts(allowed), true, `${allowed} should be allowed`);
  }

  for (const excluded of [
    '/admin',
    '/admin/settings',
    '/login',
    '/login/callback',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '',
    null,
    undefined,
  ]) {
    assert.equal(shouldLoadGlobalAdScripts(excluded), false, `${String(excluded)} should be excluded`);
  }
});

test('injectGlobalAdHtml appends once per slot using createContextualFragment', () => {
  const appended: Array<{ attr: string | null; fragmentHtml: string }> = [];
  const existing = new Set<string>();

  const fakeDoc = {
    body: {
      appendChild(node: { attr: string | null; fragmentHtml: string }) {
        appended.push(node);
        if (node.attr) existing.add(node.attr);
      },
    },
    querySelectorAll() {
      return Array.from(existing).map((val) => ({
        getAttribute: (key: string) => (key === 'data-hw-global-ad' ? val : null),
      }));
    },
    createElement() {
      const node = {
        attr: null as string | null,
        fragmentHtml: '',
        setAttribute(key: string, value: string) {
          if (key === 'data-hw-global-ad') this.attr = value;
        },
        appendChild(frag: { html: string }) {
          this.fragmentHtml = frag.html;
        },
      };
      return node;
    },
    createRange() {
      return {
        createContextualFragment(html: string) {
          return { html };
        },
      };
    },
  } as unknown as Document;

  assert.equal(injectGlobalAdHtml('social-bar', '  ', fakeDoc), false);
  assert.equal(injectGlobalAdHtml('social-bar', '<script src="https://ads.example/sb.js"></script>', fakeDoc), true);
  assert.equal(injectGlobalAdHtml('social-bar', '<script src="https://ads.example/sb.js"></script>', fakeDoc), false);
  assert.equal(injectGlobalAdHtml('popunder', '<script src="https://ads.example/pop.js"></script>', fakeDoc), true);
  assert.equal(appended.length, 2);
  assert.equal(appended[0].attr, 'social-bar');
  assert.match(appended[0].fragmentHtml, /sb\.js/);
  assert.equal(appended[1].attr, 'popunder');
});
