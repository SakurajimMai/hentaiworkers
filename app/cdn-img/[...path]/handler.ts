import { NextResponse } from 'next/server';
import { isProxiedImageHost, parseImageProxyPath } from '@/lib/server/image-proxy';

export const IMAGE_PROXY_CACHE_CONTROL = 'public, max-age=2592000, immutable';
/** How many catalog hosts a legacy (host-less) request may try before giving up. */
export const LEGACY_HOST_ATTEMPTS = 5;
const DEFAULT_ACCEPT = 'image/avif,image/webp,image/*,*/*;q=0.8';

export type ImageProxyDependencies = Readonly<{
  /** Canonical site origin; throwing means the proxy scope cannot be derived. */
  siteOrigin: () => string;
  /** Image hosts seen in the newest catalog entries, for clients that omit the host segment. */
  legacyHosts: () => Promise<readonly string[]>;
  fetchImpl?: typeof fetch;
}>;

type UpstreamResult =
  | { ok: true; response: NextResponse }
  | { ok: false; status: number };

function text(body: string, status: number): NextResponse {
  // Failures are never cacheable: a later success must not be masked by an edge-cached error.
  return new NextResponse(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function createImageProxyHandler(deps: ImageProxyDependencies) {
  const fetchImpl = deps.fetchImpl ?? fetch;

  async function fromUpstream(
    host: string,
    path: string,
    search: string,
    accept: string,
  ): Promise<UpstreamResult> {
    let upstream: Response;
    try {
      upstream = await fetchImpl(`https://${host}/${path}${search}`, {
        headers: { Accept: accept, 'User-Agent': 'AnimeStream-ImageProxy/1.0' },
        redirect: 'follow',
        next: { revalidate: 2592000 },
      });
    } catch {
      return { ok: false, status: 502 };
    }

    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok) return { ok: false, status: upstream.status || 404 };
    // A 200 carrying HTML (login wall, error page) is not an image; do not relay it as one.
    if (contentType && !contentType.startsWith('image/')) return { ok: false, status: 404 };

    const headers = new Headers();
    headers.set('Content-Type', contentType || 'image/jpeg');
    headers.set('Cache-Control', IMAGE_PROXY_CACHE_CONTROL);
    const length = upstream.headers.get('content-length');
    if (length) headers.set('Content-Length', length);
    return { ok: true, response: new NextResponse(upstream.body, { status: 200, headers }) };
  }

  return async function imageProxyHandler(
    request: Request,
    context: { params: Promise<{ path: string[] }> },
  ): Promise<NextResponse> {
    let siteOrigin: string;
    try {
      siteOrigin = deps.siteOrigin();
    } catch (error) {
      console.error('[cdn-img] SITE_URL is unusable; the proxy scope cannot be derived', error);
      return text('Image proxy is not configured', 503);
    }

    const { path } = await context.params;
    const target = parseImageProxyPath(path ?? [], siteOrigin);
    const { search } = new URL(request.url);
    const accept = request.headers.get('accept') || DEFAULT_ACCEPT;

    switch (target.kind) {
      case 'invalid':
        return text('Bad path', 400);
      case 'forbidden':
        return text('Host is not proxied', 403);
      case 'host': {
        const result = await fromUpstream(target.host, target.path, search, accept);
        if (result.ok) return result.response;
        return text(result.status === 502 ? 'Image upstream unreachable' : 'Image not found', result.status);
      }
      case 'legacy': {
        let hosts: readonly string[];
        try {
          hosts = (await deps.legacyHosts())
            .filter((host) => isProxiedImageHost(host, siteOrigin))
            .slice(0, LEGACY_HOST_ATTEMPTS);
        } catch (error) {
          console.error('[cdn-img] cannot resolve image hosts for a legacy request', error);
          return text('Image proxy is temporarily unavailable', 503);
        }
        for (const host of hosts) {
          const result = await fromUpstream(host, target.path, search, accept);
          if (result.ok) return result.response;
        }
        return text('Image not found', 404);
      }
    }
  };
}
