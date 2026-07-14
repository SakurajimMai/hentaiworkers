import { AppError } from '../../shared/errors';
import type {
  CrawlerUnitOfWork,
  JobEventRecord,
} from '../ports/crawler-unit-of-work';
import { assertValidLease, type LeaseBinding } from './lease-guard';

export const MAX_EVENT_BATCH_COUNT = 100;
export const MAX_EVENT_BATCH_BYTES = 256 * 1024;

export type EventBatchItem = Readonly<{
  sequence: number;
  level?: JobEventRecord['level'];
  eventType: string;
  message?: string | null;
  payloadJson?: string | null;
}>;

export type EventBatchResult = Readonly<{
  accepted: number;
  events: ReadonlyArray<JobEventRecord>;
}>;

export class CrawlerLogService {
  constructor(private readonly uow: CrawlerUnitOfWork) {}

  async appendBatch(
    binding: LeaseBinding,
    events: readonly EventBatchItem[],
  ): Promise<EventBatchResult> {
    if (events.length === 0) {
      return { accepted: 0, events: [] };
    }
    if (events.length > MAX_EVENT_BATCH_COUNT) {
      throw new AppError('BATCH_TOO_LARGE', `事件批次最多 ${MAX_EVENT_BATCH_COUNT} 条`, 413);
    }

    const bodyBytes = Buffer.byteLength(JSON.stringify(events), 'utf8');
    if (bodyBytes > MAX_EVENT_BATCH_BYTES) {
      throw new AppError(
        'BATCH_TOO_LARGE',
        `事件批次最多 ${MAX_EVENT_BATCH_BYTES} 字节`,
        413,
      );
    }

    return this.uow.runInTransaction(async (repos) => {
      await assertValidLease(repos, binding, { allowCancelRequested: true });

      const written: JobEventRecord[] = [];
      for (const event of events) {
        if (!Number.isInteger(event.sequence) || event.sequence < 0) {
          throw new AppError('RESULT_INVALID', '事件 sequence 无效', 400);
        }
        try {
          const row = await repos.events.append({
            jobId: binding.jobId,
            attemptId: binding.attemptId,
            sequence: event.sequence,
            level: event.level ?? 'info',
            eventType: event.eventType,
            message: event.message,
            payloadJson: event.payloadJson,
          });
          written.push(row);
        } catch (error) {
          if (error instanceof AppError && error.code === 'RESULT_CONFLICT') {
            // Duplicate sequence within attempt: treat as already accepted.
            continue;
          }
          throw error;
        }
      }
      return { accepted: written.length, events: written };
    });
  }
}
