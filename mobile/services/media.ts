export function normalizeMediaUrl(url?: string | null) {
  const value = url?.trim();
  if (!value) return null;

  try {
    return encodeURI(decodeURI(value));
  } catch {
    try {
      return encodeURI(value);
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
