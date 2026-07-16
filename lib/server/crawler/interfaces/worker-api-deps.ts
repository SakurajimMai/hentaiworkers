import type { CrawlerJobService } from '../application/crawler-job-service';
import type { CrawlerLogService } from '../application/crawler-log-service';
import type { CrawlerResultService } from '../application/crawler-result-service';
import type { CredentialRefreshService } from '../application/credential-refresh-service';
import type { MediaReservationService } from '../application/media-reservation-service';
import type { WorkerRegistryService } from '../application/worker-registry-service';
import type { StorageConfigService } from '../application/storage-config-service';
import type { WorkerAuthService } from './worker-auth';
import { AppError } from '../../shared/errors';
import { getProcessEnvironment } from '../../shared/config';
import { createMariaDbWorkerApiDeps } from './compose-mariadb-crawler';

/**
 * Injectable dependencies for Worker HTTP adapters.
 * Runtime default is MariaDB via createMariaDbWorkerApiDeps.
 * Tests inject via setWorkerApiDepsForTests / createTestWorkerApi.
 */
export type WorkerApiDeps = Readonly<{
  auth: WorkerAuthService;
  registry: WorkerRegistryService;
  jobs: CrawlerJobService;
  results: CrawlerResultService;
  logs: CrawlerLogService;
  media: MediaReservationService;
  credentials: CredentialRefreshService;
  /** Optional for external-only tests; production marks successful storage_test versions. */
  storage?: StorageConfigService;
}>;

let overrideDeps: WorkerApiDeps | null = null;
let processLocal: WorkerApiDeps | null = null;

export function setWorkerApiDepsForTests(deps: WorkerApiDeps | null): void {
  overrideDeps = deps;
  if (deps === null) processLocal = null;
}

/** Explicit composition hook (e.g. custom credential issuer). */
export function setWorkerApiDeps(deps: WorkerApiDeps | null): void {
  overrideDeps = deps;
  if (deps === null) processLocal = null;
}

export function getWorkerApiDeps(): WorkerApiDeps {
  if (overrideDeps) return overrideDeps;
  return getOrCreateMariaDbWorkerApiDeps();
}

function getOrCreateMariaDbWorkerApiDeps(): WorkerApiDeps {
  if (processLocal) return processLocal;

  const env = getProcessEnvironment();
  if (!env.DATABASE_URL) {
    throw new AppError(
      'CONFIG_INVALID',
      '缺少 DATABASE_URL：Worker API 必须使用数据库控制面，禁止静默回落内存',
      500,
    );
  }

  try {
    processLocal = createMariaDbWorkerApiDeps();
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(
      'CONFIG_INVALID',
      `无法初始化 MariaDB Worker API: ${message}`,
      500,
    );
  }
  return processLocal;
}
