import { randomBytes } from 'node:crypto';
import type { CatalogIngestionPort } from '../ports/catalog-ingestion-port';
import type { StorageConfigService } from '../application/storage-config-service';
import { CrawlerJobService } from '../application/crawler-job-service';
import { CrawlerLogService } from '../application/crawler-log-service';
import { CrawlerResultService } from '../application/crawler-result-service';
import {
  CredentialRefreshService,
  testOnlyCredentialIssuer,
} from '../application/credential-refresh-service';
import { MediaReservationService } from '../application/media-reservation-service';
import { WorkerRegistryService } from '../application/worker-registry-service';
import { hashOpaqueToken } from '../domain/hashing';
import { WORKER_SCOPES, WorkerAuthService } from '../interfaces/worker-auth';
import type { WorkerApiDeps } from '../interfaces/worker-api-deps';
import { createWorkerHandlers } from '../interfaces/create-worker-handlers';
import { InMemoryCrawlerUnitOfWork } from './in-memory-crawler-uow';
import { InMemoryWorkerRepository } from './in-memory-worker-repository';

export type TestWorkerApi = Readonly<{
  uow: InMemoryCrawlerUnitOfWork;
  workers: InMemoryWorkerRepository;
  deps: WorkerApiDeps;
  handlers: ReturnType<typeof createWorkerHandlers>;
  /** Bootstrap a worker and return plaintext machine token. */
  provisionWorker: (name?: string, scopes?: readonly string[]) => Promise<{
    workerId: number;
    token: string;
    credentialId: number;
  }>;
}>;

export function createTestWorkerApi(options?: {
  catalog?: CatalogIngestionPort;
  storage?: StorageConfigService;
}): TestWorkerApi {
  const workers = new InMemoryWorkerRepository();
  const uow = new InMemoryCrawlerUnitOfWork(undefined, workers);
  const deps: WorkerApiDeps = {
    auth: new WorkerAuthService(workers),
    registry: new WorkerRegistryService(workers),
    jobs: new CrawlerJobService(uow),
    results: new CrawlerResultService(uow, options?.catalog),
    logs: new CrawlerLogService(uow),
    media: new MediaReservationService(uow),
    credentials: new CredentialRefreshService(uow, testOnlyCredentialIssuer),
    storage: options?.storage,
  };

  return {
    uow,
    workers,
    deps,
    handlers: createWorkerHandlers(deps),
    async provisionWorker(name = 'worker-1', scopes = WORKER_SCOPES) {
      const token = randomBytes(32).toString('base64url');
      const created = await workers.createWorkerWithToken({
        name,
        tokenHash: hashOpaqueToken(token),
        scopes,
      });
      return {
        workerId: created.worker.id,
        token,
        credentialId: created.credential.id,
      };
    },
  };
}

export function sampleCapabilities(overrides?: Partial<{
  protocolVersion: number;
  sources: string[];
  storageDrivers: ('s3' | 'sftp')[];
  configSchemaVersions: number[];
  currentLoad: number;
  maxConcurrency: number;
}>) {
  return {
    protocolVersion: overrides?.protocolVersion ?? 1,
    workerVersion: '1.0.0',
    sources: overrides?.sources ?? ['hanime'],
    storageDrivers: overrides?.storageDrivers ?? (['s3'] as ('s3' | 'sftp')[]),
    configSchemaVersions: overrides?.configSchemaVersions ?? [1],
    maxConcurrency: overrides?.maxConcurrency ?? 2,
    currentLoad: overrides?.currentLoad ?? 0,
    browserVersion: 'chrome-120',
  };
}
