/** Form → config helpers (not Server Actions). */

import { MACCMS_SOURCE_KEYS } from '@/lib/server/crawler/domain/maccms-presets';

function parseCsvList(raw: string): string[] {
  return raw
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseIntList(raw: string, fallback: number[]): number[] {
  const parts = parseCsvList(raw)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  return parts.length ? parts : fallback;
}

const MACCMS_SOURCES = MACCMS_SOURCE_KEYS;

/** Build profile config from form fields (no raw JSON required). */
export function profileConfigFromForm(formData: FormData): string {
  const years = parseIntList(String(formData.get('years') || ''), [new Date().getUTCFullYear()]);
  const months = parseIntList(String(formData.get('months') || ''), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const quality = parseCsvList(String(formData.get('qualityPriority') || '1080,720'));
  const skip = parseCsvList(
    String(
      formData.get('skipKeywords')
        || '中字後補,简中补字,Chinese Sub,中文字幕後補',
    ),
  );
  const requiredSource = String(formData.get('requiredSource') || 'hanime').trim() || 'hanime';
  const typeIds = parseIntList(String(formData.get('typeIds') || ''), []);
  const maxPages = parseInt(String(formData.get('maxPages') || ''), 10);
  const maxItems = parseInt(String(formData.get('maxItems') || ''), 10);
  const hours = parseInt(String(formData.get('hours') || ''), 10);
  const pageOrderRaw = String(formData.get('pageOrder') || 'reverse').trim();
  const pageOrder =
    pageOrderRaw === 'forward' || pageOrderRaw === 'from_end' || pageOrderRaw === 'reverse'
      ? pageOrderRaw
      : 'reverse';
  const isMacCms = MACCMS_SOURCES.has(requiredSource);

  const config = {
    schemaVersion: 1 as const,
    source: {
      baseUrl: String(formData.get('baseUrl') || '').trim(),
      genre: String(formData.get('genre') || '').trim() || undefined,
      sort: String(formData.get('sort') || '').trim() || undefined,
      type: String(formData.get('type') || '').trim() || undefined,
      ...(isMacCms
        ? {
            provider: requiredSource === 'maccms'
              ? String(formData.get('provider') || '').trim() || undefined
              : requiredSource,
            // Only crawl explicitly selected categories (checkbox picker).
            typeIds: typeIds.length ? typeIds : [],
            playFrom: String(formData.get('playFrom') || '').trim() || undefined,
            maxPages:
              Number.isFinite(maxPages) && maxPages > 0
                ? Math.min(200, maxPages)
                : undefined,
            maxItems:
              Number.isFinite(maxItems) && maxItems > 0
                ? Math.min(5000, maxItems)
                : undefined,
            hours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
            pageOrder,
            // Never auto-pick types when using the admin checkbox UI.
            autoDetectTypes: false,
            filterJpKr: formData.get('filterJpKr') === '1',
          }
        : {}),
    },
    dateFilter: { years, months },
    qualityPriority: quality.length ? quality : ['1080'],
    skipKeywords: skip,
    concurrency: {
      download: Math.max(
        1,
        Math.min(32, parseInt(String(formData.get('downloadConcurrency') || '2'), 10) || 2),
      ),
      parse: Math.max(
        1,
        Math.min(32, parseInt(String(formData.get('parseConcurrency') || '2'), 10) || 2),
      ),
      page: Math.max(
        1,
        Math.min(16, parseInt(String(formData.get('pageConcurrency') || formData.get('parseConcurrency') || '2'), 10) || 2),
      ),
    },
    continueOnError: formData.get('continueOnError') === '1',
    maxActiveJobs: Math.max(1, parseInt(String(formData.get('maxActiveJobs') || '1'), 10) || 1),
    ...(isMacCms
      ? {}
      : {
          maxItems: Number.isFinite(maxItems) && maxItems > 0 ? maxItems : undefined,
          skipExisting: formData.get('skipExisting') === '1',
          requestDelaySeconds: Math.max(
            0,
            Math.min(30, Number(formData.get('requestDelaySeconds') || 1) || 0),
          ),
          media: {
            enableVideo: true,
            enableCover: formData.get('enableCover') === '1',
            enableFanart: formData.get('enableFanart') === '1',
            maxFanartImages: Math.max(
              1,
              Math.min(50, parseInt(String(formData.get('maxFanartImages') || '50'), 10) || 50),
            ),
          },
        }),
    requiredSource,
    ...(String(formData.get('storageDriver') || 'external') === 's3'
      ? { storageDriver: 's3' as const }
      : String(formData.get('storageDriver') || 'external') === 'sftp'
        ? { storageDriver: 'sftp' as const }
        : {}),
  };
  return JSON.stringify(config);
}
