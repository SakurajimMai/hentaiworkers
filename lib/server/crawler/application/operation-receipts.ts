import { AppError } from '../../shared/errors';
import {
  hashOpaqueToken,
  hashRequestBody,
  hashesEqual,
} from '../domain/hashing';
import type { OperationReceiptRepository } from '../ports/crawler-unit-of-work';

export type ReceiptResponse<T> = Readonly<{
  replayed: boolean;
  body: T;
}>;

/**
 * Idempotent write gate: same key + same request hash replays the original
 * response; same key + different hash is RESULT_CONFLICT.
 */
export async function withOperationReceipt<T>(input: {
  receipts: OperationReceiptRepository;
  operationScope: string;
  idempotencyKey: string;
  jobId: number | null;
  itemId?: number | null;
  requestBody: unknown;
  execute: () => Promise<T>;
}): Promise<ReceiptResponse<T>> {
  if (!input.idempotencyKey.trim()) {
    throw new AppError('RESULT_INVALID', '幂等键必填', 400);
  }

  const keyHash = hashOpaqueToken(input.idempotencyKey);
  const requestHash = hashRequestBody(input.requestBody);
  const existing = await input.receipts.find(input.operationScope, keyHash);

  if (existing) {
    if (!hashesEqual(existing.requestHash, requestHash)) {
      throw new AppError(
        'RESULT_CONFLICT',
        '相同幂等键但请求内容不同',
        409,
        false,
        { operationScope: input.operationScope },
      );
    }
    if (
      (existing.jobId ?? null) !== (input.jobId ?? null)
      || (existing.itemId ?? null) !== (input.itemId ?? null)
    ) {
      throw new AppError(
        'RESULT_CONFLICT',
        '相同幂等键但 job/item 范围不同',
        409,
      );
    }
    return {
      replayed: true,
      body: JSON.parse(existing.responseJson) as T,
    };
  }

  const body = await input.execute();
  try {
    await input.receipts.save({
      operationScope: input.operationScope,
      idempotencyKeyHash: keyHash,
      jobId: input.jobId,
      itemId: input.itemId ?? null,
      requestHash,
      responseJson: JSON.stringify(body),
    });
  } catch (error) {
    // Concurrent first-write race: re-read and treat as replay if hash matches.
    if (error instanceof AppError && error.code === 'RESULT_CONFLICT') {
      const raced = await input.receipts.find(input.operationScope, keyHash);
      if (raced && hashesEqual(raced.requestHash, requestHash)) {
        return {
          replayed: true,
          body: JSON.parse(raced.responseJson) as T,
        };
      }
    }
    throw error;
  }

  return { replayed: false, body };
}
