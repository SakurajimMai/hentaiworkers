import { NextResponse } from 'next/server';
import {
  StreamProxyError,
  fetchUpstream,
  isProbablyM3u8,
  rewriteM3u8Playlist,
} from '@/lib/server/media/stream-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same-origin media proxy for external MacCMS HLS.
 *
 * Why this exists:
 * - Chrome cannot play .m3u8 natively; hls.js XHR needs a reachable playlist.
 * - Some MacCMS CDNs ship expired TLS certificates. Browsers hard-fail those
 *   fetches; Node can still retrieve them with rejectUnauthorized=false.
 * - Relative segment URIs inside m3u8 must be rewritten to stay on this proxy
 *   so the browser never talks to the broken CDN cert chain directly.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url')?.trim() ?? '';
  if (!target) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  try {
    const referer = request.headers.get('referer');
    const upstream = await fetchUpstream(target, { referer });
    if (isProbablyM3u8(upstream.finalUrl, upstream.headers['content-type'] ?? '', upstream.body)) {
      const text = upstream.body.toString('utf8');
      const rewritten = rewriteM3u8Playlist(text, upstream.finalUrl, '/api/media/proxy');
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': 'public, max-age=15',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new NextResponse(new Uint8Array(upstream.body), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers['content-type'] || 'application/octet-stream',
        'Cache-Control': upstream.headers['cache-control'] || 'public, max-age=30',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    if (err instanceof StreamProxyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'proxy failed' },
      { status: 502 },
    );
  }
}
