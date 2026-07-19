import { randomBytes } from 'node:crypto';
import { AdminCrawlerService, type AdminCrawlerDeps } from '../application/admin-crawler-service';
import { CrawlerConfigService } from '../application/crawler-config-service';
import { CrawlerJobService } from '../application/crawler-job-service';
import { CrawlerScheduleService } from '../application/crawler-schedule-service';
import { SecretService } from '../application/secret-service';
import { StorageConfigService } from '../application/storage-config-service';
import { YamlImportService } from '../application/yaml-import-service';
import {
  AesGcmSecretCipher,
  keyringViewFromRecord,
} from '../../infrastructure/crypto/aes-gcm-secret-cipher';
import {
  InMemoryCrawlerConfigRepository,
  InMemorySecretRepository,
  InMemoryStorageConfigRepository,
  createInMemoryCrawlerProfileState,
} from '../testing/in-memory-config-repos';
import { InMemoryCrawlerUnitOfWork } from '../testing/in-memory-crawler-uow';
import { InMemoryWorkerRepository } from '../testing/in-memory-worker-repository';
import { AppError } from '../../shared/errors';
import { getProcessEnvironment } from '../../shared/config';
import { createMariaDbAdminDeps } from './compose-mariadb-crawler';

let override: AdminCrawlerService | null = null;
let processLocal: AdminCrawlerService | null = null;

export function setAdminCrawlerServiceForTests(service: AdminCrawlerService | null): void {
  override = service;
  if (service === null) processLocal = null;
}

/**
 * Admin crawler service: always MariaDB-backed when DATABASE_URL is available.
 * In-memory composition is test-only via createInMemoryAdminDeps / setAdminCrawlerServiceForTests.
 */
export function getAdminCrawlerService(): AdminCrawlerService {
  if (override) return override;
  return getOrCreateMariaDbAdminCrawler();
}

function getOrCreateMariaDbAdminCrawler(): AdminCrawlerService {
  if (processLocal) return processLocal;

  const env = getProcessEnvironment();
  if (!env.DATABASE_URL) {
    throw new AppError(
      'CONFIG_INVALID',
      '缺少 DATABASE_URL：爬虫控制面必须使用数据库，禁止进程内内存存储',
      500,
    );
  }

  try {
    processLocal = createAdminCrawlerService(createMariaDbAdminDeps(env));
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(
      'CONFIG_INVALID',
      `无法初始化 MariaDB 爬虫控制面: ${message}`,
      500,
    );
  }
  return processLocal;
}

/** Test-only in-memory deps — never used by getAdminCrawlerService in app runtime. */
export function createInMemoryAdminDeps(): AdminCrawlerDeps {
  const profileState = createInMemoryCrawlerProfileState();
  const profiles = new InMemoryCrawlerConfigRepository(profileState);
  const uow = new InMemoryCrawlerUnitOfWork(profileState);
  const key = randomBytes(32);
  const cipher = new AesGcmSecretCipher(keyringViewFromRecord('k1', { k1: key }));
  return {
    uow,
    jobs: new CrawlerJobService(uow),
    schedules: new CrawlerScheduleService(uow),
    profiles: new CrawlerConfigService(profiles),
    storage: new StorageConfigService(new InMemoryStorageConfigRepository()),
    secrets: new SecretService(new InMemorySecretRepository(), cipher),
    yaml: new YamlImportService(),
    workers: new InMemoryWorkerRepository(),
  };
}

export function createAdminCrawlerService(deps: AdminCrawlerDeps): AdminCrawlerService {
  return new AdminCrawlerService(deps);
}

export type { AdminCrawlerDeps };
