import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSiteMetadata, isManagedSeoMeta, siteSeoSchema, siteSeoTitle } from '../../lib/site-seo';
import { parseSiteSeoFromForm } from '../../lib/server/system/domain/site-settings-form';
import { parseSystemSettings, toPublicAdsConfig } from '../../lib/server/system/domain/settings';

test('existing settings acquire SEO defaults and homepage title', () => {
  const seo = parseSystemSettings({}).site.seo;
  assert.equal(siteSeoTitle(seo), 'AnimeStream · 里番与漫画');
  assert.equal(siteSeoTitle({ ...seo, subtitle: '' }), 'AnimeStream');
});

test('admin fields round-trip into titles, summary, keywords and share metadata', () => {
  const form = new FormData();
  form.set('siteTitle', ' 我的站点 ');
  form.set('siteSubtitle', '每日更新');
  form.set('siteDescription', '站点摘要');
  form.set('siteKeywords', '动画，漫画, 阅读\n更新');
  const seo = siteSeoSchema.parse(parseSiteSeoFromForm(form));
  const meta = buildSiteMetadata(seo);
  assert.deepEqual(meta.title, { default: '我的站点 · 每日更新', template: '%s · 我的站点' });
  assert.equal(meta.description, '站点摘要');
  assert.deepEqual(meta.keywords, ['动画', '漫画', '阅读', '更新']);
  assert.equal(meta.openGraph?.title, '我的站点 · 每日更新');
  assert.equal(meta.twitter?.description, '站点摘要');
  assert.equal(meta.applicationName, '我的站点');
});

test('omitted fields stay absent; optional fields can clear; invalid input is rejected', () => {
  const form = new FormData();
  assert.deepEqual(parseSiteSeoFromForm(form), {});
  form.set('siteSubtitle', '');
  assert.deepEqual(parseSiteSeoFromForm(form), { subtitle: '' });
  form.set('siteTitle', '  ');
  assert.throws(() => parseSiteSeoFromForm(form), /SEO/);
  form.set('siteTitle', 'x'.repeat(101));
  assert.throws(() => parseSiteSeoFromForm(form), /SEO/);
  form.set('siteTitle', 'Valid');
  form.set('siteDescription', 'x'.repeat(501));
  assert.throws(() => parseSiteSeoFromForm(form), /SEO/);
});

test('managed SEO tags cannot be duplicated by legacy custom tags', () => {
  for (const key of ['description', 'KEYWORDS', 'og:title', 'twitter:description', 'robots']) {
    assert.equal(isManagedSeoMeta(key), true);
  }
  assert.equal(isManagedSeoMeta('google-site-verification'), false);
});

test('stored banners keep their creative and index as ordinary public feed cards', () => {
  const settings = parseSystemSettings({ ads: { feedSlots: [
    { enabled: false, html: 'off' },
    { enabled: true, placement: 'banner', html: 'legacy', width: 300, height: 250 },
  ] } });
  const ads = toPublicAdsConfig(settings);
  assert.equal(ads.feedSlots.length, 1);
  assert.equal(ads.feedSlots[0].html, 'legacy');
  assert.equal(ads.feedSlots[0].width, 300);
  assert.equal('placement' in ads.feedSlots[0], false);
});
