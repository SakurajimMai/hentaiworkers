import { parse as parseYaml } from 'yaml';
import { AppError } from '../../shared/errors';
import {
  parseCrawlerProfileConfig,
  type CrawlerProfileConfig,
} from '../domain/config';

export const YAML_IMPORT_MAX_BYTES = 1_048_576;
export const YAML_IMPORT_MAX_DEPTH = 20;

export type YamlPreviewBucket =
  | 'mapped'
  | 'converted'
  | 'deprecated'
  | 'missing'
  | 'invalid'
  | 'warning';

export type YamlPreviewItem = Readonly<{
  bucket: YamlPreviewBucket;
  path: string;
  message: string;
  value?: unknown;
}>;

export type YamlImportPreview = Readonly<{
  mapped: YamlPreviewItem[];
  converted: YamlPreviewItem[];
  deprecated: YamlPreviewItem[];
  missing: YamlPreviewItem[];
  invalid: YamlPreviewItem[];
  warnings: YamlPreviewItem[];
  profileConfig: CrawlerProfileConfig | null;
  storageHints: Readonly<{
    publicBaseUrl?: string;
    prefix?: string;
    organizeByDate?: boolean;
    requiresManualDriverFields: true;
  }>;
  /** Masked only — promote via SecretService.create; plaintext not returned. */
  secrets: ReadonlyArray<{ path: string; masked: string }>;
}>;

function depthOf(value: unknown, depth = 0): number {
  if (value === null || typeof value !== 'object') return depth;
  if (Array.isArray(value)) {
    let max = depth;
    for (const item of value) {
      max = Math.max(max, depthOf(item, depth + 1));
    }
    return max;
  }
  let max = depth;
  for (const item of Object.values(value as Record<string, unknown>)) {
    max = Math.max(max, depthOf(item, depth + 1));
  }
  return max;
}

function asArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter((n) => Number.isFinite(n));
  if (typeof value === 'number') return [value];
  return [];
}

function mask(value: string): string {
  if (value.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(8, value.length - 2))}${value.slice(-2)}`;
}

/**
 * Safe YAML preview for production_config.yml migration.
 * Does not write to the database.
 */
export class YamlImportService {
  preview(rawYaml: string, options?: { nodeEnv?: string }): YamlImportPreview {
    if (Buffer.byteLength(rawYaml, 'utf8') > YAML_IMPORT_MAX_BYTES) {
      throw new AppError('RESULT_INVALID', 'YAML 超过 1 MiB 限制', 400);
    }

    let doc: unknown;
    try {
      doc = parseYaml(rawYaml, {
        maxAliasCount: 0,
        prettyErrors: true,
        strict: true,
        uniqueKeys: true,
      });
    } catch (error) {
      throw new AppError(
        'RESULT_INVALID',
        error instanceof Error ? `YAML 解析失败: ${error.message}` : 'YAML 解析失败',
        400,
      );
    }

    if (depthOf(doc) > YAML_IMPORT_MAX_DEPTH) {
      throw new AppError('RESULT_INVALID', `YAML 嵌套超过 ${YAML_IMPORT_MAX_DEPTH} 层`, 400);
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      throw new AppError('RESULT_INVALID', 'YAML 根节点必须是对象', 400);
    }

    const root = doc as Record<string, unknown>;
    const mapped: YamlPreviewItem[] = [];
    const converted: YamlPreviewItem[] = [];
    const deprecated: YamlPreviewItem[] = [];
    const missing: YamlPreviewItem[] = [];
    const invalid: YamlPreviewItem[] = [];
    const warnings: YamlPreviewItem[] = [];
    const secrets: Array<{ path: string; masked: string }> = [];

    if (root.database) {
      deprecated.push({
        bucket: 'deprecated',
        path: 'database',
        message: 'Worker 禁止连接数据库，database.* 不迁移',
      });
    }
    if (root.d1_sync) {
      deprecated.push({
        bucket: 'deprecated',
        path: 'd1_sync',
        message: '旧栈 D1 同步字段已废弃',
      });
    }
    if (root.logging && typeof root.logging === 'object') {
      deprecated.push({
        bucket: 'deprecated',
        path: 'logging.file',
        message: '文件日志语义不迁移，由事件表与容器 stdout 替代',
      });
    }

    const crawl = (root.crawl ?? {}) as Record<string, unknown>;
    const download = (root.download ?? {}) as Record<string, unknown>;
    const webAccess = (root.web_access ?? {}) as Record<string, unknown>;
    const network = (root.network ?? {}) as Record<string, unknown>;
    const selenium = (root.selenium ?? {}) as Record<string, unknown>;
    const performance = (root.performance ?? {}) as Record<string, unknown>;
    const dateFilter = (crawl.date_filter ?? {}) as Record<string, unknown>;
    const search = (crawl.search ?? {}) as Record<string, unknown>;

    if (crawl.base_url) {
      mapped.push({ bucket: 'mapped', path: 'crawl.base_url', message: '映射到来源 baseUrl', value: crawl.base_url });
    } else {
      missing.push({ bucket: 'missing', path: 'crawl.base_url', message: '缺少来源 base_url' });
    }

    const years = asArray(dateFilter.year ?? dateFilter.years);
    const months = asArray(dateFilter.month ?? dateFilter.months);
    if (years.length) mapped.push({ bucket: 'mapped', path: 'crawl.date_filter.year', message: '年份过滤', value: years });
    else missing.push({ bucket: 'missing', path: 'crawl.date_filter.year', message: '缺少年份' });
    if (months.length) mapped.push({ bucket: 'mapped', path: 'crawl.date_filter.month', message: '月份过滤', value: months });
    else missing.push({ bucket: 'missing', path: 'crawl.date_filter.month', message: '缺少月份' });

    if (Array.isArray(crawl.quality_priority)) {
      mapped.push({
        bucket: 'mapped',
        path: 'crawl.quality_priority',
        message: '质量优先级',
        value: crawl.quality_priority,
      });
    }

    const downloadConcurrent = download.max_concurrent;
    const perfConcurrent = performance.max_concurrent_downloads;
    if (downloadConcurrent !== undefined && perfConcurrent !== undefined
      && Number(downloadConcurrent) !== Number(perfConcurrent)) {
      warnings.push({
        bucket: 'warning',
        path: 'download.max_concurrent|performance.max_concurrent_downloads',
        message: '并发字段冲突，以 download.max_concurrent 为准',
        value: { download: downloadConcurrent, performance: perfConcurrent },
      });
    }
    if (downloadConcurrent !== undefined) {
      converted.push({
        bucket: 'converted',
        path: 'download.max_concurrent',
        message: '转换为 downloadConcurrency',
        value: Number(downloadConcurrent),
      });
    }

    if (download.organize_by_date !== undefined) {
      converted.push({
        bucket: 'converted',
        path: 'download.organize_by_date',
        message: '转换为存储路径 organizeByDate',
        value: Boolean(download.organize_by_date),
      });
    }
    if (download.download_dir !== undefined) {
      converted.push({
        bucket: 'converted',
        path: 'download.download_dir',
        message: '转换为对象路径模板，不再作为本地最终目录',
        value: download.download_dir,
      });
    }
    if (webAccess.domain_prefix) {
      converted.push({
        bucket: 'converted',
        path: 'web_access.domain_prefix',
        message: '转换为 storage publicBaseUrl（仍需补齐驱动字段）',
        value: webAccess.domain_prefix,
      });
    }
    if (webAccess.base_path !== undefined) {
      converted.push({
        bucket: 'converted',
        path: 'web_access.base_path',
        message: '转换为存储 prefix',
        value: webAccess.base_path,
      });
    }

    const proxy = (network.proxy ?? {}) as Record<string, unknown>;
    for (const key of ['http', 'https', 'socks5'] as const) {
      const value = proxy[key];
      if (typeof value === 'string' && value) {
        secrets.push({
          path: `network.proxy.${key}`,
          masked: mask(value),
        });
      }
    }

    if (selenium.no_sandbox === true) {
      const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
      if (nodeEnv === 'production') {
        invalid.push({
          bucket: 'invalid',
          path: 'selenium.no_sandbox',
          message: '生产环境硬拒绝 no_sandbox=true',
          value: true,
        });
      } else {
        warnings.push({
          bucket: 'warning',
          path: 'selenium.no_sandbox',
          message: '仅本地/测试允许 no_sandbox=true',
          value: true,
        });
      }
    }

    let profileConfig: CrawlerProfileConfig | null = null;
    if (crawl.base_url) {
      try {
        profileConfig = parseCrawlerProfileConfig({
          schemaVersion: 1,
          source: {
            baseUrl: String(crawl.base_url),
            genre: search.genre ? String(search.genre) : undefined,
            sort: search.sort ? String(search.sort) : undefined,
            type: search.type ? String(search.type) : undefined,
          },
          dateFilter: {
            years: years.length ? years : [new Date().getUTCFullYear()],
            months: months.length ? months : [1],
          },
          qualityPriority: Array.isArray(crawl.quality_priority) && crawl.quality_priority.length
            ? crawl.quality_priority.map(String)
            : ['1080'],
          skipKeywords: Array.isArray(crawl.skip_keywords)
            ? crawl.skip_keywords.map(String)
            : [],
          concurrency: {
            download: Number(downloadConcurrent ?? 1) || 1,
            parse: 2,
          },
          continueOnError: true,
          maxActiveJobs: 1,
        });
      } catch (error) {
        invalid.push({
          bucket: 'invalid',
          path: 'profile',
          message: error instanceof Error ? error.message : '配置校验失败',
        });
      }
    }

    return {
      mapped,
      converted,
      deprecated,
      missing,
      invalid,
      warnings,
      profileConfig,
      storageHints: {
        publicBaseUrl: webAccess.domain_prefix
          ? String(webAccess.domain_prefix)
          : undefined,
        prefix: webAccess.base_path !== undefined ? String(webAccess.base_path) : undefined,
        organizeByDate: download.organize_by_date !== undefined
          ? Boolean(download.organize_by_date)
          : undefined,
        requiresManualDriverFields: true,
      },
      secrets,
    };
  }

  /**
   * Import applies only after preview is clean enough; storage activation still
   * requires a successful storage_test job (enforced by StorageConfigService).
   */
  assertImportAllowed(preview: YamlImportPreview): void {
    if (preview.invalid.length > 0) {
      throw new AppError('RESULT_INVALID', '存在校验失败项，无法导入', 400, false, {
        invalid: preview.invalid.length,
      });
    }
    if (!preview.profileConfig) {
      throw new AppError('RESULT_INVALID', '无法生成爬虫模板配置', 400);
    }
  }
}
