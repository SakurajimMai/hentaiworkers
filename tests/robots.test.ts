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
  } finally {
    if (originalSiteUrl === undefined) {
      delete process.env.SITE_URL;
    } else {
      process.env.SITE_URL = originalSiteUrl;
    }
  }
});
