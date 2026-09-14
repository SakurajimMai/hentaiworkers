/**
 * IndexNow (https://www.indexnow.org) lets Bing/Edge, Yandex, Naver and Seznam learn about new or
 * changed URLs within minutes instead of waiting for a crawl. Google does not participate; it
 * relies on the sitemap index and internal links.
 */
/** Protocol endpoint shared by all IndexNow engines; `INDEXNOW_ENDPOINT` may point at a specific engine instead. */
export const INDEXNOW_DEFAULT_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_ENDPOINT = process.env.INDEXNOW_ENDPOINT?.trim() || INDEXNOW_DEFAULT_ENDPOINT;
export const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
export const INDEXNOW_KEY_BASE = '/indexnow';
export const INDEXNOW_MAX_URLS = 10_000;
const INDEXNOW_TIMEOUT_MS = 8_000;

export function isValidIndexNowKey(key: string): boolean {
  return INDEXNOW_KEY_PATTERN.test(key);
}

/** Where the site serves the key file: `/indexnow/{key}.txt`, passed as `keyLocation`. */
export function indexNowKeyPath(key: string): string {
  return `${INDEXNOW_KEY_BASE}/${key}.txt`;
}

export type IndexNowPayload = Readonly<{
  host: string;
  key: string;
  keyLocation: string;
  urlList: readonly string[];
}>;

export function buildIndexNowPayload(
  siteUrl: string,
  key: string,
  paths: readonly string[],
): IndexNowPayload | null {
  if (!isValidIndexNowKey(key)) return null;
  const origin = new URL(siteUrl);
  const urls = new Set<string>();
  for (const raw of paths) {
    const value = raw.trim();
    if (!value) continue;
    let absolute: URL;
    try {
      absolute = new URL(value, origin);
    } catch {
      continue;
    }
    if (absolute.origin !== origin.origin) continue;
    absolute.hash = '';
    urls.add(absolute.toString());
    if (urls.size >= INDEXNOW_MAX_URLS) break;
  }
  if (urls.size === 0) return null;
  return {
    host: origin.host,
    key,
    keyLocation: new URL(indexNowKeyPath(key), origin).toString(),
    urlList: [...urls],
  };
}

export type IndexNowResult = Readonly<{
  submitted: number;
  status: number | null;
}>;

export async function submitIndexNow(input: {
  siteUrl: string;
  key: string;
  paths: readonly string[];
  fetchImpl?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
}): Promise<IndexNowResult> {
  const payload = buildIndexNowPayload(input.siteUrl, input.key, input.paths);
  if (!payload) return { submitted: 0, status: null };
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? INDEXNOW_TIMEOUT_MS);
  try {
    const response = await fetchImpl(input.endpoint ?? INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { submitted: payload.urlList.length, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

/** Plain-text key file handler; `loadKey` returns the configured key or an empty string. */
export function createIndexNowKeyHandler(loadKey: () => Promise<string>) {
  return async function indexNowKeyHandler(
    _request: Request,
    context: { params: Promise<{ file: string }> },
  ): Promise<Response> {
    const { file } = await context.params;
    let key = '';
    try {
      key = (await loadKey()).trim();
    } catch (error) {
      console.error('[indexnow] key lookup failed', error);
      return new Response('IndexNow unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!isValidIndexNowKey(key) || file !== `${key}.txt`) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response(key, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Robots-Tag': 'noindex',
      },
    });
  };
}
