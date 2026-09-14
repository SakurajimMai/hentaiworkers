/**
 * `/cdn-img/**` proxies exactly one image host, configured per deployment through
 * `IMAGE_PROXY_UPSTREAM` (an absolute HTTP(S) origin, no path). The host is deliberately not
 * written into source: an unset value disables the proxy instead of falling back to a default.
 */
export const IMAGE_PROXY_UPSTREAM_ENV = 'IMAGE_PROXY_UPSTREAM';

export function resolveImageProxyUpstream(
  value: string | undefined = process.env[IMAGE_PROXY_UPSTREAM_ENV],
): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${IMAGE_PROXY_UPSTREAM_ENV} 必须是绝对 HTTP(S) 地址`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${IMAGE_PROXY_UPSTREAM_ENV} 仅支持 HTTP(S) 协议`);
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${IMAGE_PROXY_UPSTREAM_ENV} 不能包含路径、查询参数或片段`);
  }
  return parsed.origin;
}

/** Origin for resource hints; swallows configuration errors so a bad value cannot break page rendering. */
export function imageProxyOriginForHints(): string | null {
  try {
    return resolveImageProxyUpstream();
  } catch {
    return null;
  }
}
