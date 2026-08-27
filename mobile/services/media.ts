const DEFAULT_SITE_ORIGIN = 'https://www.ixacg.de';
const PROXIED_IMAGE_HOSTS = new Set(['image.ixacg.de']);

function siteOrigin(): string {
  try {
    // 延迟引用，避免和 api.ts 形成加载环。
    const { API_BASE_URL } = require('./api') as { API_BASE_URL: string };
    return (API_BASE_URL || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export function imageRequestHeaders(origin = siteOrigin()): Record<string, string> {
  return {
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    Referer: `${origin}/`,
  };
}

/** Cloudflare 图床在部分网络下 APK 直连失败，改走主站同源代理。 */
export function rewriteCdnUrl(url: string, origin = siteOrigin()): string {
  try {
    const parsed = new URL(url);
    if (!PROXIED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase()) || !origin) {
      return parsed.toString();
    }
    const path = parsed.pathname.replace(/^\/+/, '');
    return `${origin}/cdn-img/${path}${parsed.search}`;
  } catch {
    return url;
  }
}

export function normalizeMediaUrl(url?: string | null) {
  const value = url?.trim();
  if (!value) return null;

  try {
    return rewriteCdnUrl(new URL(value).toString());
  } catch {
    try {
      return rewriteCdnUrl(encodeURI(value));
    } catch {
      return value;
    }
  }
}

export function splitMediaList(value?: string | null) {
  if (!value) return [];

  return value
    .split(',')
    .map((item) => normalizeMediaUrl(item))
    .filter((item): item is string => Boolean(item));
}
