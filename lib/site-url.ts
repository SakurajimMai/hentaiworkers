export function resolveSiteUrl(
  value: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
) {
  const candidate = value?.trim();
  if (!candidate) {
    if (nodeEnv === 'production') {
      throw new Error('SITE_URL 在生产环境中必须显式配置');
    }
    return 'http://localhost:3000';
  }

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
