import { resolveSiteUrl } from '@/lib/site-url';

/**
 * `/cdn-img/<host>/<path>` proxies images from hosts under the site's own domain: a site at
 * `www.example.com` proxies `image1.example.com`, `image2.example.com`, ... The scope is derived
 * from `SITE_URL`, so adding an image host needs no configuration on the server or in the app.
 * Hosts outside that domain are never fetched, and the site host itself is refused so the proxy
 * cannot be pointed back at itself.
 *
 * The Android client applies the same rule from its API origin (`MediaUrlNormalizer`); keep the
 * two implementations identical.
 */
export const IMAGE_PROXY_SEGMENT = 'cdn-img';

const HOST_PATTERN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const HOST_SEGMENT_PATTERN = /^([^:/?#]+)(?::(\d{1,5}))?$/;

/**
 * Registrable domains that sit two labels below the TLD. A site directly under one of these
 * (`example.co.uk`) must keep its own host as the scope instead of widening it to `*.co.uk`.
 */
const TWO_LABEL_PUBLIC_SUFFIXES = new Set(
  `
  co.uk org.uk ac.uk gov.uk me.uk net.uk ltd.uk plc.uk sch.uk
  com.au net.au org.au edu.au gov.au id.au
  co.nz net.nz org.nz govt.nz ac.nz
  co.jp ne.jp or.jp ac.jp go.jp gr.jp
  com.cn net.cn org.cn gov.cn edu.cn ac.cn
  com.hk net.hk org.hk edu.hk gov.hk
  com.tw net.tw org.tw edu.tw gov.tw
  com.sg net.sg org.sg edu.sg gov.sg
  com.my net.my org.my
  co.kr ne.kr or.kr re.kr go.kr
  co.in net.in org.in firm.in gen.in ind.in
  com.br net.br org.br
  com.mx org.mx gob.mx
  com.ar net.ar org.ar
  co.za net.za org.za web.za
  com.tr net.tr org.tr
  com.ua net.ua org.ua
  co.il org.il net.il ac.il
  com.vn net.vn org.vn
  com.ph net.ph org.ph
  co.th in.th or.th ac.th go.th
  com.pk net.pk org.pk
  com.eg com.sa com.ng com.pe com.co com.ec com.ve com.uy com.py com.bo com.do com.gt com.pa com.sv com.ni com.hn com.cr
  `.split(/\s+/).filter(Boolean),
);

function hostOf(origin: string): string {
  return new URL(origin).hostname.toLowerCase();
}

/** The site host minus its first label when it has one to spare: `www.example.com` -> `example.com`. */
export function imageProxyDomain(siteOrigin: string): string {
  const host = hostOf(siteOrigin);
  const labels = host.split('.');
  if (labels.length < 3) return host;
  const parent = labels.slice(1).join('.');
  return TWO_LABEL_PUBLIC_SUFFIXES.has(parent) ? host : parent;
}

/** True when `host` (no port) is the proxied domain or below it, and is not the site itself. */
export function isProxiedImageHost(host: string, siteOrigin: string): boolean {
  const candidate = host.trim().toLowerCase();
  if (!candidate || candidate === hostOf(siteOrigin)) return false;
  const domain = imageProxyDomain(siteOrigin);
  return candidate === domain || candidate.endsWith(`.${domain}`);
}

/** Re-encode path segments for the upstream URL; rejects traversal and empty paths. */
export function encodeImagePath(segments: readonly string[]): string | null {
  if (!segments.length) return null;
  const joined = segments.join('/');
  if (!joined || joined.includes('..') || joined.startsWith('/')) return null;
  return joined
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export type ImageProxyTarget =
  /** New format: the first segment names the image host (optionally `host:port`). */
  | { kind: 'host'; host: string; path: string }
  /** Pre-Build-112 clients send the path without a host segment. */
  | { kind: 'legacy'; path: string }
  | { kind: 'forbidden'; host: string }
  | { kind: 'invalid' };

export function parseImageProxyPath(
  parts: readonly string[],
  siteOrigin: string,
): ImageProxyTarget {
  if (!parts.length) return { kind: 'invalid' };
  const [first, ...rest] = parts;
  const hostMatch = HOST_SEGMENT_PATTERN.exec(first.toLowerCase());
  const host = hostMatch?.[1] ?? '';

  if (!hostMatch || !HOST_PATTERN.test(host)) {
    const path = encodeImagePath(parts);
    return path ? { kind: 'legacy', path } : { kind: 'invalid' };
  }
  if (!isProxiedImageHost(host, siteOrigin)) return { kind: 'forbidden', host: first };

  const path = encodeImagePath(rest);
  if (!path) return { kind: 'invalid' };
  const port = hostMatch[2] === undefined ? null : Number(hostMatch[2]);
  if (port !== null && (port < 1 || port > 65535)) return { kind: 'invalid' };
  return { kind: 'host', host: port === null ? host : `${host}:${port}`, path };
}

/** Distinct host names of the given URLs in first-seen order; unparsable entries are skipped. */
export function hostsFromUrls(urls: ReadonlyArray<string | null | undefined>): string[] {
  const hosts: string[] = [];
  for (const url of urls) {
    if (!url) continue;
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host && !hosts.includes(host)) hosts.push(host);
    } catch {
      // Not an absolute URL; nothing to proxy.
    }
  }
  return hosts;
}

/** Proxy scope for status reporting; an unusable SITE_URL reports an empty scope instead of throwing. */
export function imageProxyDomainForHints(): string {
  try {
    return imageProxyDomain(resolveSiteUrl(process.env.SITE_URL));
  } catch {
    return '';
  }
}
