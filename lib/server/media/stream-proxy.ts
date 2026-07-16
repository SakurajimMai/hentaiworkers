import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { URL } from 'node:url';

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8 MiB (playlists / small segments)
const FETCH_TIMEOUT_MS = 20_000;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export class StreamProxyError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StreamProxyError';
    this.status = status;
  }
}

function isPrivateIp(ip: string): boolean {
  // node:net isIP + manual private ranges (no dependency on ipaddr.js).
  const kind = isIP(ip);
  if (kind === 0) return true;
  if (kind === 4) {
    const parts = ip.split('.').map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
  if (normalized.startsWith('fe80')) return true; // link-local
  if (normalized.startsWith('ff')) return true; // multicast
  // IPv4-mapped IPv6
  if (normalized.includes('.')) {
    const mapped = normalized.split(':').pop() ?? '';
    if (isIP(mapped) === 4) return isPrivateIp(mapped);
  }
  return false;
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new StreamProxyError(400, 'invalid url');
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new StreamProxyError(400, 'only http(s) urls are allowed');
  }
  if (parsed.username || parsed.password) {
    throw new StreamProxyError(400, 'credentials in url are not allowed');
  }
  const hostname = parsed.hostname.replace(/\.$/, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new StreamProxyError(400, 'localhost targets are not allowed');
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new StreamProxyError(400, 'private ip targets are not allowed');
    }
    return parsed;
  }
  let addresses: string[] = [];
  try {
    const result = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = result.map((row) => row.address);
  } catch {
    throw new StreamProxyError(400, 'hostname could not be resolved');
  }
  if (!addresses.length || addresses.some((addr) => isPrivateIp(addr))) {
    throw new StreamProxyError(400, 'resolved address is not public');
  }
  return parsed;
}

export type ProxiedResponse = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  finalUrl: string;
};

function requestOnce(url: URL, headers: Record<string, string>): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}> {
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers,
        timeout: FETCH_TIMEOUT_MS,
        // MacCMS CDNs sometimes ship expired certs; browsers cannot ignore this,
        // so the same-origin proxy deliberately relaxes TLS verification.
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BODY_BYTES) {
            req.destroy();
            reject(new StreamProxyError(502, 'upstream body too large'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 502,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new StreamProxyError(504, 'upstream timeout'));
    });
    req.on('error', (err) => {
      reject(new StreamProxyError(502, err.message || 'upstream request failed'));
    });
    req.end();
  });
}

export async function fetchUpstream(
  rawUrl: string,
  options: { referer?: string | null } = {},
): Promise<ProxiedResponse> {
  const referer = options.referer;
  let current = await assertPublicHttpUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
    };
    if (referer) headers.Referer = String(referer);

    const response = await requestOnce(current, headers);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) throw new StreamProxyError(502, 'redirect without location');
      const next = new URL(location, current);
      current = await assertPublicHttpUrl(next.toString());
      continue;
    }
    if (response.status >= 400) {
      throw new StreamProxyError(response.status, `upstream returned ${response.status}`);
    }
    const contentType = String(response.headers['content-type'] || 'application/octet-stream');
    return {
      status: response.status,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=30',
      },
      body: response.body,
      finalUrl: current.toString(),
    };
  }
  throw new StreamProxyError(502, 'too many redirects');
}

/** Rewrite absolute/relative URIs inside an m3u8 body so hls.js stays on same-origin proxy. */
export function rewriteM3u8Playlist(
  body: string,
  playlistUrl: string,
  proxyPath: string,
): string {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        // Rewrite URI="..." attributes (KEY, MAP, MEDIA, etc.)
        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/gi, (_match, uri: string) => {
            const absolute = new URL(uri, playlistUrl).toString();
            return `URI="${proxyPath}?url=${encodeURIComponent(absolute)}"`;
          });
        }
        return line;
      }
      const absolute = new URL(trimmed, playlistUrl).toString();
      return `${proxyPath}?url=${encodeURIComponent(absolute)}`;
    })
    .join('\n');
}

export function isProbablyM3u8(url: string, contentType: string, body: Buffer): boolean {
  if (/\.m3u8(\?|#|$)/i.test(url)) return true;
  if (/mpegurl|m3u8/i.test(contentType)) return true;
  const head = body.subarray(0, 16).toString('utf8');
  return head.startsWith('#EXTM3U');
}
