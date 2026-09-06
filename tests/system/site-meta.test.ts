import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SITE_META_TAGS, siteMetaTagsSchema } from '../../lib/site-meta';
import { parseSystemSettings } from '../../lib/server/system/domain/settings';
import { parseSiteMetaTagsFromForm } from '../../lib/server/system/domain/site-settings-form';
import { AppError } from '../../lib/server/shared/errors';

test('global verification tags accept third-party names, properties and repeated verification names', () => {
  const input = [
    { key: 'google-site-verification', content: '  first-token  ' },
    { key: 'google-site-verification', content: 'second-token' },
    { key: 'google-adsense-account', content: 'ca-pub-123' },
    { attribute: 'property', key: 'fb:app_id', content: '987654' },
  ];
  const parsed = parseSystemSettings({ site: { metaTags: input } });
  assert.equal(parsed.site.metaTags[0].attribute, 'name');
  assert.equal(parsed.site.metaTags[0].content, 'first-token');
  assert.equal(parsed.site.metaTags[1].key, 'google-site-verification');
  assert.equal(parsed.site.metaTags[3].attribute, 'property');
  assert.deepEqual(parseSystemSettings({}).site.metaTags, []);
});

test('global tag validation rejects unsupported attributes, core viewport overrides and excessive records', () => {
  for (const tag of [
    { attribute: 'http-equiv', key: 'refresh', content: '0;url=https://example.com' },
    { key: 'viewport', content: 'user-scalable=no' },
    { key: 'Theme-Color', content: 'red' },
    { key: 'verification" onload="alert(1)', content: 'token' },
    { key: '', content: 'token' },
    { key: 'verification', content: '   ' },
    { key: 'verification', content: 'token', onload: 'alert(1)' },
    { key: 'verification', content: 'x'.repeat(4097) },
  ]) {
    assert.equal(siteMetaTagsSchema.safeParse([tag]).success, false);
  }
  assert.equal(siteMetaTagsSchema.safeParse(Array.from({ length: MAX_SITE_META_TAGS + 1 }, () => ({
    key: 'verification', content: 'token',
  }))).success, false);
});

test('meta form differentiates an old form from explicit removal and rejects corrupt data', () => {
  const form = new FormData();
  assert.equal(parseSiteMetaTagsFromForm(form), undefined);
  form.set('siteMetaTagsJson', '[]');
  assert.deepEqual(parseSiteMetaTagsFromForm(form), []);
  form.set('siteMetaTagsJson', JSON.stringify([{ key: 'ad-verification', content: 'token' }]));
  assert.deepEqual(parseSiteMetaTagsFromForm(form), [{ attribute: 'name', key: 'ad-verification', content: 'token' }]);
  for (const invalid of ['{', '{}', '[{"name":"unrecognized"}]']) {
    form.set('siteMetaTagsJson', invalid);
    assert.throws(() => parseSiteMetaTagsFromForm(form), (error: unknown) =>
      error instanceof AppError && error.details?.field === 'siteMetaTags');
  }
});
