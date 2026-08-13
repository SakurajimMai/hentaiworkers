import assert from 'node:assert/strict';
import test from 'node:test';
import robots, { dynamic } from '../app/robots';


test('robots 在运行时使用 SITE_URL 并保持动态生成', () => {
  const originalSiteUrl = process.env.SITE_URL;
  process.env.SITE_URL = 'https://runtime.example.com';

  try {
    const result = robots();
    assert.equal(dynamic, 'force-dynamic');
    assert.equal(result.sitemap, 'https://runtime.example.com/sitemap.xml');
    assert.ok(Array.isArray(result.rules));
    const general = result.rules[0];
    const generalDisallow = Array.isArray(general.disallow) ? general.disallow : [general.disallow];
    assert.ok(generalDisallow.includes('/account'));
    assert.ok(generalDisallow.includes('/verify-email'));
    const ai = result.rules[1];
    const aiAllow = Array.isArray(ai.allow) ? ai.allow : [ai.allow];
    assert.ok(aiAllow.includes('/'));
    assert.ok(aiAllow.includes('/llms.txt'));
  } finally {
    if (originalSiteUrl === undefined) {
      delete process.env.SITE_URL;
    } else {
      process.env.SITE_URL = originalSiteUrl;
    }
  }
});
