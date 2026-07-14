export const DEFAULT_SITE_URL = 'https://anime.ixacg.top';

export function resolveSiteUrl(value: string | undefined) {
  const candidate = value?.trim() || DEFAULT_SITE_URL;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('SITE_URL 必须是绝对 HTTP(S) 地址');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('SITE_URL 仅支持 HTTP(S) 协议');
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('SITE_URL 不能包含路径、查询参数或片段');
  }

  return parsed.origin;
}
