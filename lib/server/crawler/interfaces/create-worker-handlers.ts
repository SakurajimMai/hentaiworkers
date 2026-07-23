import type { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors';
import { workerCapabilitiesSchema } from '../domain/worker-protocol';
import {
  extractLeaseToken,
  LEASE_TOKEN_HEADER,
  type AuthenticatedWorker,
  type WorkerAuthService,
} from './worker-auth';
import {
  claimBodySchema,
  completeBodySchema,
  credentialsRefreshBodySchema,
  eventsBatchBodySchema,
  failBodySchema,
  itemExistsBodySchema,
  itemsCommitBodySchema,
  jobHeartbeatBodySchema,
  MAX_WORKER_BODY_BYTES,
  mediaReserveBodySchema,
  mediaStatusBodySchema,
  registerBodySchema,
  startBodySchema,
  workerHeartbeatBodySchema,
} from './worker-request';
import type { WorkerApiDeps } from './worker-api-deps';
import {
  presentWorkerEmpty,
  presentWorkerError,
  presentWorkerOk,
} from './worker-presenter';

async function readJsonBody(req: NextRequest): Promise<unknown> {
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_WORKER_BODY_BYTES) {
    throw new AppError('BATCH_TOO_LARGE', `请求体超过 ${MAX_WORKER_BODY_BYTES} 字节`, 413);
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new AppError('RESULT_INVALID', 'JSON 解析失败', 400);
  }
}

function zodToAppError(error: ZodError): AppError {
  return new AppError('RESULT_INVALID', '请求校验失败', 400, false, {
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

async function authenticate(
  deps: WorkerApiDeps,
  req: NextRequest,
  scope: Parameters<WorkerAuthService['requireScope']>[1],
): Promise<AuthenticatedWorker> {
  const auth = await deps.auth.authenticate(req.headers.get('authorization'));
  deps.auth.requireScope(auth, scope);
  return auth;
}

function jobIdFromParams(params: { id: string }): number {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('RESULT_INVALID', '无效任务 ID', 400);
  }
  return id;
}

function workerIdFromParams(params: { workerId: string }): number {
  const id = Number(params.workerId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('RESULT_INVALID', '无效 Worker ID', 400);
  }
  return id;
}

export function createWorkerHandlers(deps: WorkerApiDeps) {
  return {
    async register(req: NextRequest) {
      try {
        const auth = await authenticate(deps, req, 'workers:register');
        const body = registerBodySchema.parse(await readJsonBody(req));
        const workerId = body.workerId ?? auth.worker.id;
        deps.auth.requireWorkerMatch(auth, workerId);

        const result = await deps.registry.register({
          workerId,
          name: body.name,
          capabilities: body.capabilities,
        });
        return presentWorkerOk({
          workerId: result.worker.id,
          protocolVersion: result.protocolVersion,
          name: result.worker.name,
          version: result.worker.version,
          lastHeartbeatAt: result.worker.lastHeartbeatAt,
        });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async workerHeartbeat(req: NextRequest, params: { workerId: string }) {
      try {
        const auth = await authenticate(deps, req, 'workers:heartbeat');
        const workerId = workerIdFromParams(params);
        deps.auth.requireWorkerMatch(auth, workerId);
        const body = workerHeartbeatBodySchema.parse(await readJsonBody(req));

        const worker = await deps.registry.heartbeat({
          workerId,
          capabilities: body.capabilities,
          currentLoad: body.currentLoad,
          version: body.version,
        });
        return presentWorkerOk({
          workerId: worker.id,
          lastHeartbeatAt: worker.lastHeartbeatAt,
          version: worker.version,
        });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async claim(req: NextRequest) {
      try {
        const auth = await authenticate(deps, req, 'jobs:claim');
        const body = claimBodySchema.parse(await readJsonBody(req));

        let capabilities = body.capabilities;
        if (!capabilities && auth.worker.capabilitiesJson) {
          try {
            capabilities = workerCapabilitiesSchema.parse(
              JSON.parse(auth.worker.capabilitiesJson),
            );
          } catch {
            capabilities = undefined;
          }
        }

        const waitSeconds = body.waitSeconds ?? 0;
        const claimed = await deps.jobs.claimForWorker({
          workerId: auth.worker.id,
          capabilities,
          waitMs: Math.min(20, Math.max(0, waitSeconds)) * 1000,
        });

        if (!claimed) {
          return presentWorkerEmpty(204);
        }

        return presentWorkerOk({
          jobId: claimed.job.id,
          attemptId: claimed.attempt.id,
          leaseToken: claimed.leaseToken,
          leaseExpiresAt: claimed.attempt.leaseExpiresAt,
          kind: claimed.job.kind,
          status: claimed.job.status,
          configSnapshotJson: claimed.job.configSnapshotJson,
          profileVersionId: claimed.job.profileVersionId,
          maxAttempts: claimed.job.maxAttempts,
          attemptNo: claimed.attempt.attemptNo,
        });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async start(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:write');
        const jobId = jobIdFromParams(params);
        const body = startBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);

        const job = await deps.jobs.start({
          jobId,
          attemptId: body.attemptId,
          workerId: auth.worker.id,
          leaseToken,
        });
        return presentWorkerOk({ jobId: job.id, status: job.status, startedAt: job.startedAt });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async jobHeartbeat(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:write');
        const jobId = jobIdFromParams(params);
        const body = jobHeartbeatBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);

        const result = await deps.jobs.heartbeat({
          jobId,
          attemptId: body.attemptId,
          workerId: auth.worker.id,
          leaseToken,
        });
        return presentWorkerOk({
          jobId: result.job.id,
          status: result.job.status,
          cancelRequested: result.cancelRequested,
          leaseExpiresAt: result.leaseExpiresAt,
        });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async eventsBatch(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:write');
        const jobId = jobIdFromParams(params);
        const body = eventsBatchBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);

        const result = await deps.logs.appendBatch(
          {
            jobId,
            attemptId: body.attemptId,
            workerId: auth.worker.id,
            leaseToken,
          },
          body.events,
        );
        return presentWorkerOk({ accepted: result.accepted });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async mediaReserve(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:write');
        const jobId = jobIdFromParams(params);
        const body = mediaReserveBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);

        const reserved = await deps.media.reserve({
          jobId,
          attemptId: body.attemptId,
          workerId: auth.worker.id,
          leaseToken,
          itemKey: body.itemKey,
          itemId: body.itemId,
          assetKind: body.assetKind,
          prefix: body.prefix,
          organizeByDate: body.organizeByDate,
        });
        return presentWorkerOk({
          uploadId: reserved.id,
          stagingKey: reserved.stagingKey,
          finalKey: reserved.finalKey,
          status: reserved.status,
        });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async mediaStatus(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:write');
        const jobId = jobIdFromParams(params);
        const body = mediaStatusBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);
        const upload = await deps.media.markStatus(
          {
            jobId,
            attemptId: body.attemptId,
            workerId: auth.worker.id,
            leaseToken,
          },
          body.uploadId,
          body.status,
        );
        return presentWorkerOk({ uploadId: upload.id, status: upload.status });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async credentialsRefresh(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:credentials');
        const jobId = jobIdFromParams(params);
        const body = credentialsRefreshBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);

        const creds = await deps.credentials.refresh(
          {
            jobId,
            attemptId: body.attemptId,
            workerId: auth.worker.id,
            leaseToken,
          },
          { prefix: body.prefix },
        );
        return presentWorkerOk(creds, {
          headers: { 'Cache-Control': 'no-store' },
        });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async itemExists(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:write');
        const jobId = jobIdFromParams(params);
        const body = itemExistsBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);
        const existing = await deps.results.findExisting({
          jobId,
          attemptId: body.attemptId,
          workerId: auth.worker.id,
          leaseToken,
          source: body.source,
          sourceId: body.sourceId,
        });
        return presentWorkerOk({
          exists: existing != null,
          animeId: existing?.animeId ?? null,
          target: existing?.target ?? null,
        });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async itemsCommit(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:write');
        const jobId = jobIdFromParams(params);
        const body = itemsCommitBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);

        const result = await deps.results.commitItem({
          jobId,
          attemptId: body.attemptId,
          workerId: auth.worker.id,
          leaseToken,
          idempotencyKey: body.idempotencyKey,
          source: body.source,
          sourceId: body.sourceId,
          stage: body.stage,
          status: body.status,
          animeId: body.animeId,
          title: body.title,
          titleEnglish: body.titleEnglish,
          titleJapanese: body.titleJapanese,
          videoUrl: body.videoUrl,
          coverUrl: body.coverUrl,
          fanartUrls: body.fanartUrls,
          description: body.description,
          tags: body.tags,
          releaseYear: body.releaseYear,
          releaseDate: body.releaseDate,
          remarks: body.remarks,
          actors: body.actors,
          directors: body.directors,
          aliases: body.aliases,
          area: body.area,
          lang: body.lang,
          sourceUpdatedAt: body.sourceUpdatedAt,
          errorCode: body.errorCode,
          errorMessage: body.errorMessage,
          playLines: body.playLines,
        });
        return presentWorkerOk({
          replayed: result.replayed,
          itemId: result.item.id,
          animeId: result.item.animeId,
          created: result.catalog?.kind === 'upserted' ? result.catalog.created : false,
          status: result.item.status,
        });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async complete(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:write');
        const jobId = jobIdFromParams(params);
        const body = completeBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);

        const outcome =
          body.outcome
          ?? (body.failedItems && body.failedItems > 0
            ? body.continueOnError
              ? 'partial_succeeded'
              : 'failed'
            : 'succeeded');

        const result = await deps.jobs.complete({
          jobId,
          attemptId: body.attemptId,
          workerId: auth.worker.id,
          leaseToken,
          idempotencyKey: body.idempotencyKey,
          outcome,
          succeededItems: body.succeededItems,
          failedItems: body.failedItems,
          continueOnError: body.continueOnError,
        });
        if (
          result.job.kind === 'storage_test'
          && result.job.status === 'succeeded'
          && result.job.storageProfileVersionId
          && deps.storage
        ) {
          await deps.storage.markStorageTestPassed(result.job.storageProfileVersionId);
        }
        return presentWorkerOk({
          replayed: result.replayed,
          jobId: result.job.id,
          status: result.job.status,
        });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async fail(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:write');
        const jobId = jobIdFromParams(params);
        const body = failBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);

        const result = await deps.jobs.fail({
          jobId,
          attemptId: body.attemptId,
          workerId: auth.worker.id,
          leaseToken,
          idempotencyKey: body.idempotencyKey,
          retryable: body.retryable,
          errorCode: body.errorCode,
          errorMessage: body.errorMessage,
        });
        return presentWorkerOk({
          replayed: result.replayed,
          jobId: result.job.id,
          status: result.job.status,
        });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },

    async cancelAck(req: NextRequest, params: { id: string }) {
      try {
        const auth = await authenticate(deps, req, 'jobs:write');
        const jobId = jobIdFromParams(params);
        const body = startBodySchema.parse(await readJsonBody(req));
        const leaseToken = extractLeaseToken(req.headers, body.leaseToken);
        const job = await deps.jobs.cancelAck({
          jobId,
          attemptId: body.attemptId,
          workerId: auth.worker.id,
          leaseToken,
        });
        return presentWorkerOk({ jobId: job.id, status: job.status });
      } catch (error) {
        if (error instanceof ZodError) return presentWorkerError(zodToAppError(error));
        return presentWorkerError(error);
      }
    },
  };
}

export type WorkerHandlers = ReturnType<typeof createWorkerHandlers>;

export { LEASE_TOKEN_HEADER };
