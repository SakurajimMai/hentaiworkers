import { z } from 'zod';
import { workerCapabilitiesSchema } from '../domain/worker-protocol';

export const registerBodySchema = z.object({
  workerId: z.number().int().positive().optional(),
  name: z.string().min(1).max(128).optional(),
  capabilities: workerCapabilitiesSchema,
});

export const workerHeartbeatBodySchema = z.object({
  capabilities: workerCapabilitiesSchema.optional(),
  currentLoad: z.number().int().min(0).max(64).optional(),
  version: z.string().min(1).max(64).optional(),
  currentJobId: z.number().int().positive().optional(),
});

export const claimBodySchema = z.object({
  capabilities: workerCapabilitiesSchema.optional(),
  waitSeconds: z.number().int().min(0).max(20).optional(),
});

export const startBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
});

export const jobHeartbeatBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
  progress: z.record(z.unknown()).optional(),
});

export const eventsBatchBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
  events: z
    .array(
      z.object({
        sequence: z.number().int().min(0),
        level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
        eventType: z.string().min(1).max(64),
        message: z.string().max(4000).nullable().optional(),
        payloadJson: z.string().max(16_384).nullable().optional(),
      }),
    )
    .max(100),
});

export const mediaReserveBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
  itemKey: z.string().min(1).max(255),
  itemId: z.number().int().positive().nullable().optional(),
  assetKind: z.enum(['video', 'cover', 'fanart', 'other']).optional(),
  prefix: z.string().max(256).optional(),
  organizeByDate: z.boolean().optional(),
});

export const credentialsRefreshBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
  prefix: z.string().max(256).optional(),
});

export const itemsCommitBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).max(128),
  source: z.string().min(1).max(64),
  sourceId: z.string().min(1).max(255),
  stage: z.string().max(64).optional(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled']),
  animeId: z.number().int().positive().nullable().optional(),
  errorCode: z.string().max(64).nullable().optional(),
  errorMessage: z.string().max(2000).nullable().optional(),
});

export const completeBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).max(128),
  outcome: z.enum(['succeeded', 'partial_succeeded', 'failed']).optional(),
  succeededItems: z.number().int().min(0).optional(),
  failedItems: z.number().int().min(0).optional(),
  continueOnError: z.boolean().optional(),
});

export const failBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).max(128),
  retryable: z.boolean(),
  errorCode: z.string().max(64).optional(),
  errorMessage: z.string().max(2000).optional(),
});

export const MAX_WORKER_BODY_BYTES = 256 * 1024;
