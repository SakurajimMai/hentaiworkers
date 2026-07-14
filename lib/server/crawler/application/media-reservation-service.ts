import { AppError } from '../../shared/errors';
import { buildMediaObjectKeys } from '../domain/media-paths';
import type {
  CrawlerUnitOfWork,
  MediaUploadRecord,
} from '../ports/crawler-unit-of-work';
import { assertValidLease, type LeaseBinding } from './lease-guard';

export type ReserveMediaInput = LeaseBinding & Readonly<{
  itemKey: string;
  itemId?: number | null;
  assetKind?: 'video' | 'cover' | 'fanart' | 'other';
  prefix?: string;
  organizeByDate?: boolean;
}>;

export class MediaReservationService {
  constructor(private readonly uow: CrawlerUnitOfWork) {}

  async reserve(input: ReserveMediaInput): Promise<MediaUploadRecord> {
    if (!input.itemKey.trim()) {
      throw new AppError('RESULT_INVALID', 'itemKey 必填', 400);
    }

    return this.uow.runInTransaction(async (repos) => {
      await assertValidLease(repos, input);

      let keys: { stagingKey: string; finalKey: string };
      try {
        keys = buildMediaObjectKeys({
          prefix: input.prefix,
          jobId: input.jobId,
          attemptId: input.attemptId,
          itemKey: input.itemKey,
          assetKind: input.assetKind ?? 'video',
          organizeByDate: input.organizeByDate,
          now: input.now,
        });
      } catch {
        throw new AppError('RESULT_INVALID', '非法对象前缀', 400);
      }

      return repos.media.reserve({
        jobId: input.jobId,
        attemptId: input.attemptId,
        itemId: input.itemId ?? null,
        stagingKey: keys.stagingKey,
        finalKey: keys.finalKey,
      });
    });
  }

  /**
   * Discover reserved uploads older than TTL for cleanup reconciliation.
   */
  async listExpiredReservations(
    olderThan: Date,
  ): Promise<ReadonlyArray<MediaUploadRecord>> {
    return this.uow.runInTransaction((repos) =>
      repos.media.listExpiredReserved(olderThan.toISOString()),
    );
  }

  async markAbandoned(uploadId: number): Promise<MediaUploadRecord> {
    return this.uow.runInTransaction((repos) =>
      repos.media.markStatus(uploadId, 'abandoned'),
    );
  }

  async listOrphanedFinals(): Promise<ReadonlyArray<MediaUploadRecord>> {
    return this.uow.runInTransaction(async (repos) => {
      const uploaded = await repos.media.listByStatus('uploaded');
      const published = await repos.media.listByStatus('published');
      const candidates = [...uploaded, ...published];
      const orphans: MediaUploadRecord[] = [];
      for (const row of candidates) {
        const attempt = await repos.jobs.getAttempt(row.attemptId);
        if (
          !attempt
          || attempt.resultStatus === 'lease_lost'
          || attempt.resultStatus === 'failed'
        ) {
          orphans.push(row);
        }
      }
      return orphans;
    });
  }
}
