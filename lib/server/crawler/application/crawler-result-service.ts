import { AppError } from '../../shared/errors';
import type {
  CatalogIngestionPort,
  CatalogIngestionResult,
} from '../ports/catalog-ingestion-port';
import type { CrawlerUnitOfWork, JobItemRecord } from '../ports/crawler-unit-of-work';
import { assertValidLease, type LeaseBinding } from './lease-guard';
import { withOperationReceipt } from './operation-receipts';

export type CommitItemInput = LeaseBinding & Readonly<{
  idempotencyKey: string;
  source: string;
  sourceId: string;
  stage?: string;
  status: JobItemRecord['status'];
  animeId?: number | null;
  title?: string | null;
  titleEnglish?: string | null;
  titleJapanese?: string | null;
  videoUrl?: string | null;
  coverUrl?: string | null;
  fanartUrls?: readonly string[];
  description?: string | null;
  tags?: readonly string[];
  releaseYear?: number | null;
  releaseDate?: string | null;
  remarks?: string | null;
  actors?: string | null;
  directors?: string | null;
  aliases?: string | null;
  area?: string | null;
  lang?: string | null;
  sourceUpdatedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  playLines?: ReadonlyArray<{
    name: string;
    flag?: string;
    episodes: ReadonlyArray<{ name: string; url: string }>;
  }>;
}>;

export type CommitItemResult = Readonly<{
  replayed: boolean;
  item: JobItemRecord;
  catalog?: CatalogIngestionResult;
}>;

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname;
  } catch {
    return false;
  }
}

function optionalHttpUrl(value: string | null | undefined, field: string): void {
  if (value && !isHttpUrl(value)) {
    throw new AppError('RESULT_INVALID', `${field} 必须是 HTTP(S) 地址`, 400);
  }
}

/**
 * Sole application entry for crawler item commits. Production composes a
 * catalog ingestion adapter so catalog rows and job state share one DB transaction.
 */
export class CrawlerResultService {
  constructor(
    private readonly uow: CrawlerUnitOfWork,
    private readonly catalog?: CatalogIngestionPort,
  ) {}

  async findExisting(
    input: LeaseBinding & { source: string; sourceId: string },
  ): Promise<CatalogIngestionResult | null> {
    const source = input.source.trim();
    const sourceId = input.sourceId.trim();
    if (!source || !sourceId) {
      throw new AppError('RESULT_INVALID', 'source 与 source_id 必填', 400);
    }
    return this.uow.runInTransaction(async (repos) => {
      await assertValidLease(repos, input);
      return this.catalog?.findExistingBySource?.(source, sourceId) ?? null;
    });
  }

  async commitItem(input: CommitItemInput): Promise<CommitItemResult> {
    const source = input.source.trim();
    const sourceId = input.sourceId.trim();
    if (!source || !sourceId) {
      throw new AppError('RESULT_INVALID', 'source 与 source_id 必填', 400);
    }

    if (input.status === 'succeeded' && input.animeId == null && this.catalog) {
      if (!input.title?.trim() || !isHttpUrl(input.videoUrl)) {
        throw new AppError('RESULT_INVALID', '成功条目的标题与 HTTP(S) 视频地址必填', 400);
      }
      optionalHttpUrl(input.coverUrl, 'coverUrl');
      for (const fanartUrl of input.fanartUrls ?? []) {
        optionalHttpUrl(fanartUrl, 'fanartUrl');
      }
    }

    return this.uow.runInTransaction(async (repos) => {
      const requestBody = {
        source,
        sourceId,
        stage: input.stage ?? 'done',
        status: input.status,
        animeId: input.animeId ?? null,
        title: input.title?.trim() || null,
        titleEnglish: input.titleEnglish?.trim() || null,
        titleJapanese: input.titleJapanese?.trim() || null,
        videoUrl: input.videoUrl?.trim() || null,
        coverUrl: input.coverUrl?.trim() || null,
        fanartUrls: input.fanartUrls ?? [],
        description: input.description?.trim() || null,
        tags: input.tags ?? [],
        releaseYear: input.releaseYear ?? null,
        releaseDate: input.releaseDate ?? null,
        remarks: input.remarks?.trim() || null,
        actors: input.actors?.trim() || null,
        directors: input.directors?.trim() || null,
        aliases: input.aliases?.trim() || null,
        area: input.area?.trim() || null,
        lang: input.lang?.trim() || null,
        sourceUpdatedAt: input.sourceUpdatedAt?.trim() || null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        playLines: input.playLines ?? [],
      };

      const receipt = await withOperationReceipt({
        receipts: repos.receipts,
        operationScope: `job.item:${input.jobId}`,
        idempotencyKey: input.idempotencyKey,
        jobId: input.jobId,
        requestBody,
        execute: async () => {
          await assertValidLease(repos, input);

          let catalog: CatalogIngestionResult | undefined;
          let animeId = input.animeId ?? null;
          if (input.status === 'succeeded' && animeId == null && this.catalog) {
            catalog = await this.catalog.upsertFromCrawler({
              source,
              sourceId,
              title: requestBody.title!,
              videoUrl: requestBody.videoUrl!,
              titleEnglish: requestBody.titleEnglish,
              titleJapanese: requestBody.titleJapanese,
              description: requestBody.description,
              coverUrl: requestBody.coverUrl,
              fanartUrls: requestBody.fanartUrls,
              tags: requestBody.tags,
              releaseYear: requestBody.releaseYear,
              releaseDate: requestBody.releaseDate,
              remarks: requestBody.remarks,
              actors: requestBody.actors,
              directors: requestBody.directors,
              aliases: requestBody.aliases,
              area: requestBody.area,
              lang: requestBody.lang,
              sourceUpdatedAt: requestBody.sourceUpdatedAt,
              playLines: requestBody.playLines,
            });
            animeId = catalog.animeId;
          }

          const item = await repos.items.upsert({
            jobId: input.jobId,
            source,
            sourceId,
            stage: input.stage ?? 'done',
            status: input.status,
            animeId,
            errorCode: input.errorCode,
            errorMessage: input.errorMessage,
          });
          return { item, ...(catalog ? { catalog } : {}) };
        },
      });

      return {
        replayed: receipt.replayed,
        item: receipt.body.item,
        ...(receipt.body.catalog ? { catalog: receipt.body.catalog } : {}),
      };
    });
  }
}
