import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPublicHttpUrl,
  isProbablyM3u8,
  rewriteM3u8Playlist,
  StreamProxyError,
} from '@/lib/server/media/stream-proxy';

test('assertPublicHttpUrl rejects non-http and localhost', async () => {
  await assert.rejects(() => assertPublicHttpUrl('file:///etc/passwd'), StreamProxyError);
  await assert.rejects(() => assertPublicHttpUrl('http://localhost/x'), StreamProxyError);
  await assert.rejects(() => assertPublicHttpUrl('http://127.0.0.1/x'), StreamProxyError);
  await assert.rejects(() => assertPublicHttpUrl('http://192.168.1.1/x'), StreamProxyError);
});

test('assertPublicHttpUrl accepts public https urls', async () => {
  const url = await assertPublicHttpUrl('https://bfikuncdn.com/a/index.m3u8');
  assert.equal(url.hostname, 'bfikuncdn.com');
});

test('rewriteM3u8Playlist rewrites relative and absolute media lines', () => {
  const body = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=1',
    '/2026/hls/index.m3u8',
    '#EXTINF:4,',
    'https://kkzycdn.com:65/a.ts',
    '#EXT-X-KEY:METHOD=AES-128,URI="key.key"',
  ].join('\n');
  const out = rewriteM3u8Playlist(
    body,
    'https://bfikuncdn.com/2026/master.m3u8',
    '/api/media/proxy',
  );
  assert.match(out, /\/api\/media\/proxy\?url=https%3A%2F%2Fbfikuncdn.com%2F2026%2Fhls%2Findex.m3u8/);
  assert.match(out, /\/api\/media\/proxy\?url=https%3A%2F%2Fkkzycdn.com%3A65%2Fa.ts/);
  assert.match(out, /URI="\/api\/media\/proxy\?url=https%3A%2F%2Fbfikuncdn.com%2F2026%2Fkey.key"/);
});

test('isProbablyM3u8 detects playlist by extension, type, or body', () => {
  assert.equal(isProbablyM3u8('https://x/a.m3u8', 'text/plain', Buffer.from('x')), true);
  assert.equal(
    isProbablyM3u8('https://x/a', 'application/vnd.apple.mpegurl', Buffer.from('x')),
    true,
  );
  assert.equal(isProbablyM3u8('https://x/a', 'text/plain', Buffer.from('#EXTM3U\n')), true);
  assert.equal(isProbablyM3u8('https://x/a.ts', 'video/mp2t', Buffer.from('zzzz')), false);
});
