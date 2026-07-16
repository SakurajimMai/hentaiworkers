import { MACCMS_SOURCE_KEYS } from './maccms-presets';

/** Where a crawler success item should land in the app catalog. */
export type CatalogTarget = 'legacy_animes' | 'anime_works';

/**
 * MacCMS JP/KR anime providers write external stream links into `anime_works`.
 * Legacy sources (e.g. hanime) continue to use the existing `animes` catalog.
 * Never download media for either path in the default external-URL mode.
 */
export function catalogTargetForSource(source: string): CatalogTarget {
  const key = source.trim().toLowerCase();
  if (MACCMS_SOURCE_KEYS.has(key)) return 'anime_works';
  return 'legacy_animes';
}
