import { z } from 'zod';
import type { AdsterraPlacement } from '../domain/settings';

export const ADSTERRA_API_BASE = 'https://api3.adsterratools.com/publisher';

export type AdsterraApiErrorReason = 'unauthorized' | 'network' | 'invalid_response' | 'http';

export class AdsterraApiError extends Error {
  constructor(
    readonly reason: AdsterraApiErrorReason,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AdsterraApiError';
  }
}

const domainsResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      title: z.string(),
    }),
  ),
});

const placementsResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      domain_id: z.number().int().nullish(),
      title: z.string().nullish(),
      alias: z.string().nullish(),
      direct_url: z.string().nullish(),
    }),
  ),
});

function validHttpUrl(raw: string | null | undefined): string {
  const url = String(raw ?? '').trim();
  return /^https?:\/\//i.test(url) ? url.slice(0, 1000) : '';
}

export async function fetchAdsterraInventory(
  apiKey: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AdsterraPlacement[]> {
  const key = apiKey.trim();
  if (!key) {
    throw new AdsterraApiError('unauthorized', 'Adsterra API Key 不能为空');
  }

  const fetchFn = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const requestInit: RequestInit = {
    method: 'GET',
    headers: {
      'X-API-Key': key,
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  };

  let domainsRes: Response;
  let placementsRes: Response;
  try {
    [domainsRes, placementsRes] = await Promise.all([
      fetchFn(`${ADSTERRA_API_BASE}/domains.json`, requestInit),
      fetchFn(`${ADSTERRA_API_BASE}/placements.json`, requestInit),
    ]);
  } catch (error) {
    throw new AdsterraApiError(
      'network',
      error instanceof Error ? error.message : 'Adsterra API request failed',
    );
  }

  for (const res of [domainsRes, placementsRes]) {
    if (res.status === 401 || res.status === 403) {
      throw new AdsterraApiError('unauthorized', 'Adsterra API Key 无效或无权限', res.status);
    }
    if (!res.ok) {
      throw new AdsterraApiError('http', `Adsterra API HTTP ${res.status}`, res.status);
    }
  }

  let domainsJson: unknown;
  let placementsJson: unknown;
  try {
    [domainsJson, placementsJson] = await Promise.all([
      domainsRes.json(),
      placementsRes.json(),
    ]);
  } catch {
    throw new AdsterraApiError('invalid_response', 'Adsterra API 响应不是有效 JSON');
  }

  const domainsParsed = domainsResponseSchema.safeParse(domainsJson);
  const placementsParsed = placementsResponseSchema.safeParse(placementsJson);
  if (!domainsParsed.success || !placementsParsed.success) {
    throw new AdsterraApiError('invalid_response', 'Adsterra API 响应结构不符合预期');
  }

  const domainMap = new Map<number, string>();
  for (const domain of domainsParsed.data.items) {
    domainMap.set(domain.id, domain.title.trim().slice(0, 255));
  }

  return placementsParsed.data.items.slice(0, 200).map((item) => {
    const rawTitle = (item.title || item.alias || String(item.id)).trim();
    return {
      id: item.id,
      title: rawTitle.slice(0, 200),
      domain: item.domain_id != null ? domainMap.get(item.domain_id) ?? '' : '',
      directUrl: validHttpUrl(item.direct_url),
    };
  });
}

export function pickAdsterraSmartlink(
  placements: readonly AdsterraPlacement[],
  siteHost: string,
): string {
  const candidates = placements.filter((item) => /^https?:\/\//i.test(item.directUrl.trim()));
  if (candidates.length === 0) return '';

  const host = siteHost.trim().toLowerCase();
  if (host) {
    const matched = candidates.find((item) => {
      const domain = item.domain.trim().toLowerCase();
      return Boolean(domain) && (host === domain || host.endsWith(`.${domain}`));
    });
    if (matched) return matched.directUrl.trim();
  }

  return candidates[0].directUrl.trim();
}
