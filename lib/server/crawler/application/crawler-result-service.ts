import { AppError } from '../../shared/errors';
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
  errorCode?: string | null;
  errorMessage?: string | null;
}>;

export type CommitItemResult = Readonly<{
  replayed: boolean;
  item: JobItemRecord;
}>;

/**
 * Sole application entry for crawler item result commits.
 * Catalog ingestion unit-of-work is composed here later; this owns lease +
 * receipt + item upsert semantics required by Task 9.
 */
export class CrawlerResultService {
  constructor(private readonly uow: CrawlerUnitOfWork) {}

  async commitItem(input: CommitItemInput): Promise<CommitItemResult> {
    if (!input.source.trim() || !input.sourceId.trim()) {
      throw new AppError('RESULT_INVALID', 'source 与 source_id 必填', 400);
    }

    return this.uow.runInTransaction(async (repos) => {
      const requestBody = {
        source: input.source,
        sourceId: input.sourceId,
        stage: input.stage ?? 'done',
        status: input.status,
        animeId: input.animeId ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      };

      const receipt = await withOperationReceipt({
        receipts: repos.receipts,
        operationScope: `job.item:${input.jobId}`,
        idempotencyKey: input.idempotencyKey,
        jobId: input.jobId,
        requestBody,
        execute: async () => {
          await assertValidLease(repos, input);
          const item = await repos.items.upsert({
            jobId: input.jobId,
            source: input.source.trim(),
            sourceId: input.sourceId.trim(),
            stage: input.stage ?? 'done',
            status: input.status,
            animeId: input.animeId,
            errorCode: input.errorCode,
            errorMessage: input.errorMessage,
          });
          return { item };
        },
      });

      return { replayed: receipt.replayed, item: receipt.body.item };
    });
  }
}
