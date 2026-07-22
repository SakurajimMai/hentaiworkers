/** Form → config helpers (not Server Actions). */

import { MACCMS_SOURCE_KEYS } from '@/lib/server/crawler/domain/maccms-presets';
import type { CrawlerProfileConfig } from '@/lib/server/crawler/domain/config';

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

function inferRequiredSource(config: CrawlerProfileConfig): string {
  if (config.requiredSource) return config.requiredSource;
  const provider = config.source.provider;
  if (!provider) return 'hanime';
  return MACCMS_SOURCES.has(provider) ? provider : 'maccms';
}

/** Convert an immutable profile snapshot into editable form values. */
export function profileFormDefaults(
  name: string,
  config: CrawlerProfileConfig,
) {
  return {
    name,
    requiredSource: inferRequiredSource(config),
    provider: config.source.provider ?? '',
    baseUrl: config.source.baseUrl,
    typeIds: config.source.typeIds?.join(',') ?? '',
    sourcePlayFrom: config.source.sourcePlayFrom ?? config.source.playFrom ?? '',
    playFrom:
      config.source.sourcePlayFrom === undefined
        ? ''
        : config.source.playFrom ?? '',
    hours: config.source.hours ?? '',
    type: config.source.type ?? '',
    genre: config.source.genre ?? '',
    sort: config.source.sort ?? '',
    maxPages: config.source.maxPages ?? 3,
    maxItems: config.source.maxItems ?? config.maxItems ?? '',
    pageOrder: config.source.pageOrder ?? 'reverse',
    filterJpKr: config.source.filterJpKr ?? false,
    autoDetectTypes: config.source.autoDetectTypes ?? false,
    years: config.dateFilter.years.join(','),
    months: config.dateFilter.months.join(','),
    qualityPriority: config.qualityPriority.join(','),
    skipKeywords: config.skipKeywords.join(','),
    downloadConcurrency: config.concurrency.download,
    parseConcurrency: config.concurrency.parse,
    pageConcurrency: config.concurrency.page ?? config.concurrency.parse,
    maxActiveJobs: config.maxActiveJobs,
    continueOnError: config.continueOnError,
    skipExisting: config.skipExisting ?? false,
    requestDelaySeconds: config.requestDelaySeconds ?? 1,
    enableCover: config.media?.enableCover ?? true,
    enableFanart: config.media?.enableFanart ?? true,
    maxFanartImages: config.media?.maxFanartImages ?? 50,
    storageDriver: config.storageDriver ?? 'external',
  } as const;
}

export type ProfileFormDefaults = ReturnType<typeof profileFormDefaults>;

/** Build profile config from form fields (no raw JSON required). */
export function profileConfigFromForm(
  formData: FormData,
  baseConfig?: CrawlerProfileConfig,
): string {
  const years = parseIntList(String(formData.get('years') || ''), [new Date().getUTCFullYear()]);
  const months = parseIntList(String(formData.get('months') || ''), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const quality = parseCsvList(String(formData.get('qualityPriority') || '1080,720'));
  const skip = parseCsvList(
    formData.has('skipKeywords')
      ? String(formData.get('skipKeywords') ?? '')
      : '中字後補,简中补字,Chinese Sub,中文字幕後補',
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
  const sameSource = baseConfig
    ? inferRequiredSource(baseConfig) === requiredSource
    : false;
  const normalizedMaxPages =
    Number.isFinite(maxPages) && maxPages > 0 ? Math.min(200, maxPages) : undefined;
  const normalizedSourceMaxItems =
    Number.isFinite(maxItems) && maxItems >= 0 ? Math.min(5000, maxItems) : undefined;
  const displayedBaseMaxItems = baseConfig
    ? baseConfig.source.maxItems ?? baseConfig.maxItems
    : undefined;
  const sourceMaxItems =
    sameSource
    && baseConfig?.source.maxItems === undefined
    && displayedBaseMaxItems === normalizedSourceMaxItems
      ? undefined
      : normalizedSourceMaxItems;
  const sourcePlayFrom = String(formData.get('sourcePlayFrom') || '').trim() || undefined;
  const playFrom = String(formData.get('playFrom') || '').trim() || undefined;
  const preserveLegacyPlayFrom = Boolean(
    isMacCms
    && playFrom === undefined
    && sourcePlayFrom
    && baseConfig?.source.sourcePlayFrom === undefined
    && (
      baseConfig === undefined
      || (
        sameSource
        && baseConfig.source.playFrom
        && sourcePlayFrom === baseConfig.source.playFrom
      )
    )
  );
  const pageConcurrency = Math.max(
    1,
    Math.min(
      16,
      parseInt(
        String(
          formData.get('pageConcurrency')
          || formData.get('parseConcurrency')
          || '2',
        ),
        10,
      ) || 2,
    ),
  );

  const config = {
    schemaVersion: 1 as const,
    source: {
      baseUrl: String(formData.get('baseUrl') || '').trim(),
      genre: String(formData.get('genre') || '').trim() || undefined,
      sort: String(formData.get('sort') || '').trim() || undefined,
      type: String(formData.get('type') || '').trim() || undefined,
      ...(isMacCms
        ? {
            provider:
              sameSource
              && baseConfig?.source.provider === undefined
              && requiredSource !== 'maccms'
                ? undefined
                : requiredSource === 'maccms'
                  ? String(formData.get('provider') || '').trim() || undefined
                  : requiredSource,
            // Only crawl explicitly selected categories (checkbox picker).
            typeIds:
              sameSource
              && baseConfig?.source.typeIds === undefined
              && typeIds.length === 0
                ? undefined
                : typeIds,
            ...(preserveLegacyPlayFrom
              ? { playFrom: baseConfig?.source.playFrom ?? sourcePlayFrom }
              : { sourcePlayFrom, playFrom }),
            maxPages:
              sameSource
              && baseConfig?.source.maxPages === undefined
              && normalizedMaxPages === 3
                ? undefined
                : normalizedMaxPages,
            maxItems: sourceMaxItems,
            hours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
            pageOrder:
              sameSource
              && baseConfig?.source.pageOrder === undefined
              && pageOrder === 'reverse'
                ? undefined
                : pageOrder,
            autoDetectTypes:
              sameSource
              && baseConfig?.source.autoDetectTypes === undefined
              && formData.get('autoDetectTypes') !== '1'
                ? undefined
                : formData.get('autoDetectTypes') === '1',
            filterJpKr:
              sameSource
              && baseConfig?.source.filterJpKr === undefined
              && formData.get('filterJpKr') !== '1'
                ? undefined
                : formData.get('filterJpKr') === '1',
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
      page:
        sameSource
        && baseConfig?.concurrency.page === undefined
        && pageConcurrency === baseConfig?.concurrency.parse
          ? undefined
          : pageConcurrency,
    },
    continueOnError: formData.get('continueOnError') === '1',
    maxActiveJobs: Math.max(1, parseInt(String(formData.get('maxActiveJobs') || '1'), 10) || 1),
    ...(isMacCms
      ? {
          ...(baseConfig
            ? {
                maxItems: baseConfig.maxItems,
                skipExisting: baseConfig.skipExisting,
                requestDelaySeconds: baseConfig.requestDelaySeconds,
              }
            : {}),
          media: {
            enableVideo: baseConfig?.media.enableVideo ?? true,
            enableCover: formData.get('enableCover') === '1',
            enableFanart: baseConfig?.media.enableFanart ?? true,
            maxFanartImages: baseConfig?.media.maxFanartImages ?? 50,
          },
        }
      : {
          maxItems: Number.isFinite(maxItems) && maxItems >= 0 ? maxItems : undefined,
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
    requiredSource:
      sameSource && baseConfig?.requiredSource === undefined
        ? undefined
        : requiredSource,
    ...(String(formData.get('storageDriver') || 'external') === 's3'
      ? { storageDriver: 's3' as const }
      : String(formData.get('storageDriver') || 'external') === 'sftp'
        ? { storageDriver: 'sftp' as const }
        : {}),
    ...(baseConfig?.deprecated ? { deprecated: baseConfig.deprecated } : {}),
  };
  return JSON.stringify(config);
}
