import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSiteUrl } from '../lib/site-url';


test('规范化站点基础 URL 并保留本地 HTTP 地址', () => {
  assert.equal(resolveSiteUrl('https://anime.example.com/'), 'https://anime.example.com');
  assert.equal(resolveSiteUrl('http://localhost:3000'), 'http://localhost:3000');
});

test('未配置时使用生产默认域名', () => {
  assert.equal(resolveSiteUrl(undefined), 'https://anime.ixacg.top');
});

test('拒绝非 HTTP 协议、相对地址、路径、查询参数和片段', () => {
  for (const value of [
    'anime.example.com',
    'ftp://anime.example.com',
    'https://anime.example.com/base',
    'https://anime.example.com/?from=test',
    'https://anime.example.com/#top',
  ]) {
    assert.throws(() => resolveSiteUrl(value), /SITE_URL/);
  }
});
