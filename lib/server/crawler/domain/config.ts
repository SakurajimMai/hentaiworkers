import { z } from 'zod';

export const crawlerProfileConfigSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    baseUrl: z.string().url(),
    genre: z.string().optional(),
    sort: z.string().optional(),
    type: z.string().optional(),
  }),
  dateFilter: z.object({
    years: z.array(z.number().int().min(1970).max(2100)).min(1),
    months: z.array(z.number().int().min(1).max(12)).min(1),
  }),
  qualityPriority: z.array(z.string().min(1)).min(1),
  skipKeywords: z.array(z.string()).default([]),
  concurrency: z.object({
    download: z.number().int().min(1).max(32).default(2),
    parse: z.number().int().min(1).max(32).default(2),
  }),
  continueOnError: z.boolean().default(true),
  maxActiveJobs: z.number().int().min(1).max(16).default(1),
  /** Capability hints for Worker claim matching. */
  requiredSource: z.string().min(1).optional(),
  storageDriver: z.enum(['s3', 'sftp']).optional(),
  /** Deprecated YAML fields mapped for import warnings. */
  deprecated: z.record(z.string(), z.unknown()).optional(),
});

export type CrawlerProfileConfig = z.infer<typeof crawlerProfileConfigSchema>;

export const storageConfigSchema = z.discriminatedUnion('driver', [
  z.object({
    driver: z.literal('s3'),
    endpoint: z.string().url(),
    region: z.string().min(1),
    bucket: z.string().min(1),
    prefix: z.string().default(''),
    deliveryMode: z.enum(['public', 'cdn', 'private']).default('public'),
    publicBaseUrl: z.string().url().optional(),
    forcePathStyle: z.boolean().default(false),
    organizeByDate: z.boolean().default(true),
  }),
  z.object({
    driver: z.literal('sftp'),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(22),
    username: z.string().min(1),
    rootPath: z.string().min(1),
    hostKeyFingerprint: z.string().min(16),
    publicBaseUrl: z.string().url().optional(),
    organizeByDate: z.boolean().default(true),
  }),
]);

export type StorageConfig = z.infer<typeof storageConfigSchema>;

export function parseCrawlerProfileConfig(value: unknown): CrawlerProfileConfig {
  return crawlerProfileConfigSchema.parse(value);
}

export function parseStorageConfig(value: unknown): StorageConfig {
  return storageConfigSchema.parse(value);
}

/** Stable JSON for snapshots / JSON_VALID columns (deep key sort). */
export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(deepSortKeys(value));
}

function deepSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepSortKeys);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = deepSortKeys(obj[key]);
    }
    return sorted;
  }
  return value;
}
