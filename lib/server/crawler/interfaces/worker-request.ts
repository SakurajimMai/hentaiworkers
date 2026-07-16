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

export const mediaStatusBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
  uploadId: z.number().int().positive(),
  status: z.enum(['uploaded', 'published', 'abandoned', 'cleaned']),
});

export const credentialsRefreshBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
  prefix: z.string().max(256).optional(),
});

const httpUrlSchema = z
  .string()
  .max(1000)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), '必须是 HTTP(S) 地址');

export const itemExistsBodySchema = z.object({
  attemptId: z.number().int().positive(),
  leaseToken: z.string().min(1).optional(),
  source: z.string().min(1).max(64),
  sourceId: z.string().min(1).max(255),
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
  title: z.string().max(500).nullable().optional(),
  titleEnglish: z.string().max(500).nullable().optional(),
  titleJapanese: z.string().max(500).nullable().optional(),
  videoUrl: httpUrlSchema.nullable().optional(),
  coverUrl: httpUrlSchema.nullable().optional(),
  fanartUrls: z.array(httpUrlSchema).max(30).optional(),
  description: z.string().max(50_000).nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).max(100).optional(),
  releaseYear: z.number().int().min(1970).max(2100).nullable().optional(),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  remarks: z.string().max(255).nullable().optional(),
  actors: z.string().max(1000).nullable().optional(),
  directors: z.string().max(512).nullable().optional(),
  aliases: z.string().max(1000).nullable().optional(),
  area: z.string().max(128).nullable().optional(),
  lang: z.string().max(128).nullable().optional(),
  sourceUpdatedAt: z.string().max(32).nullable().optional(),
  errorCode: z.string().max(64).nullable().optional(),
  errorMessage: z.string().max(2000).nullable().optional(),
  /** MacCMS multi play-line payload for anime_works episode grids. */
  playLines: z
    .array(
      z.object({
        name: z.string().min(1).max(64),
        flag: z.string().min(1).max(64).optional(),
        episodes: z
          .array(
            z.object({
              name: z.string().min(1).max(128),
              url: httpUrlSchema,
            }),
          )
          .max(500),
      }),
    )
    .max(30)
    .optional(),
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
