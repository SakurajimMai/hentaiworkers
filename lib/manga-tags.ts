/**
 * Manga tags live on the manga row (JSON / legacy delimited text).
 * They are not the 里番 `tags` / `anime_tags` dictionary.
 */

export const MAX_MANGA_TAG_LENGTH = 40;
export const MAX_MANGA_TAGS = 30;

function cleanTag(value: string): string {
  return value.normalize('NFKC').trim();
}

export function normalizeMangaTagQuery(value: string | null | undefined): string {
  const tag = cleanTag(value ?? '');
  if (!tag) return '';
  return tag.slice(0, MAX_MANGA_TAG_LENGTH);
}

export function parseMangaTags(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeMangaTags(parsed.map((item) => String(item)));
    }
  } catch {
    // Older manual records may use comma-separated tags.
  }
  return normalizeMangaTags(value.split(/[\n,，、|]+/));
}

export function normalizeMangaTags(values: string[] | null | undefined): string[] {
  return [...new Set(
    (values ?? [])
      .map((item) => cleanTag(item).slice(0, MAX_MANGA_TAG_LENGTH))
      .filter(Boolean),
  )].slice(0, MAX_MANGA_TAGS);
}

export function mangaRecordHasTag(raw: string | null | undefined, tag: string): boolean {
  const needle = normalizeMangaTagQuery(tag);
  if (!needle) return false;
  return parseMangaTags(raw).some((item) => item === needle);
}

export function mangaTagHref(tag: string): string {
  const needle = normalizeMangaTagQuery(tag);
  if (!needle) return '/manga';
  return `/manga?tag=${encodeURIComponent(needle)}`;
}
