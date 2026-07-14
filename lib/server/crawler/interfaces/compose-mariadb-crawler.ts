/**
 * Production / dev composition: MariaDB-backed crawler control plane.
 * In-memory stores are test-only (see createInMemoryAdminDeps / createTestWorkerApi).
 */
import { createHash } from 'node:crypto';
import {
  AesGcmSecretCipher,
  keyringViewFromRecord,
  type EncryptionKeyringView,
} from '../../infrastructure/crypto/aes-gcm-secret-cipher';
import {
  MariaDbCrawlerConfigRepository,
  MariaDbCrawlerUnitOfWork,
  MariaDbSecretRepository,
  MariaDbStorageConfigRepository,
  MariaDbWorkerRepository,
} from '../../infrastructure/database/mariadb-crawler-repositories';
import { AppError } from '../../shared/errors';
import { getProcessEnvironment, type EnvironmentSource } from '../../shared/config';
import { CrawlerConfigService } from '../application/crawler-config-service';
import { CrawlerJobService } from '../application/crawler-job-service';
import { CrawlerLogService } from '../application/crawler-log-service';
import { CrawlerResultService } from '../application/crawler-result-service';
import { CrawlerScheduleService } from '../application/crawler-schedule-service';
import { CredentialRefreshService } from '../application/credential-refresh-service';
import { MediaReservationService } from '../application/media-reservation-service';
import { SecretService } from '../application/secret-service';
import { StorageConfigService } from '../application/storage-config-service';
import { WorkerRegistryService } from '../application/worker-registry-service';
import { YamlImportService } from '../application/yaml-import-service';
import type { AdminCrawlerDeps } from '../application/admin-crawler-service';
import { WorkerAuthService } from './worker-auth';
import type { WorkerApiDeps } from './worker-api-deps';

/**
 * Resolve AES-GCM keyring for secret envelope encryption.
 * Prefer APP_ENCRYPTION_KEYRING; otherwise derive a stable 32-byte key from SESSION_SECRET
 * so local/dev can store secrets in DB without a separate keyring (not a substitute for
 * proper keyring rotation in production).
 */
export function resolveSecretCipher(env: EnvironmentSource = getProcessEnvironment()): AesGcmSecretCipher {
  return new AesGcmSecretCipher(resolveEncryptionKeyring(env));
}

export function resolveEncryptionKeyring(
  env: EnvironmentSource = getProcessEnvironment(),
): EncryptionKeyringView {
  const raw = env.APP_ENCRYPTION_KEYRING;
  const currentKeyId = env.APP_ENCRYPTION_CURRENT_KEY_ID;

  if (raw && currentKeyId) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new AppError('CONFIG_INVALID', 'APP_ENCRYPTION_KEYRING 必须是 JSON 对象', 500);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AppError('CONFIG_INVALID', 'APP_ENCRYPTION_KEYRING 必须是非空 JSON 对象', 500);
    }
    const keys: Record<string, Uint8Array> = {};
    for (const [keyId, encoded] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof encoded !== 'string') {
        throw new AppError('CONFIG_INVALID', 'APP_ENCRYPTION_KEYRING 密钥格式无效', 500);
      }
      const decoded = Buffer.from(encoded, 'base64');
      if (decoded.byteLength !== 32 || decoded.toString('base64') !== encoded) {
        throw new AppError(
          'CONFIG_INVALID',
          'APP_ENCRYPTION_KEYRING 密钥必须是规范 Base64 编码的 32 字节',
          500,
        );
      }
      keys[keyId] = new Uint8Array(decoded);
    }
    if (!keys[currentKeyId]) {
      throw new AppError(
        'CONFIG_INVALID',
        'APP_ENCRYPTION_CURRENT_KEY_ID 必须存在于 keyring',
        500,
      );
    }
    return keyringViewFromRecord(currentKeyId, keys);
  }

  const session = env.SESSION_SECRET;
  if (!session || session.length < 32) {
    throw new AppError(
      'CONFIG_INVALID',
      '加密密钥未配置：请设置 APP_ENCRYPTION_KEYRING + APP_ENCRYPTION_CURRENT_KEY_ID，或提供长度 ≥32 的 SESSION_SECRET 用于派生',
      500,
    );
  }

  const material = new Uint8Array(
    createHash('sha256').update(`anime-web:crawler-secrets:v1:${session}`, 'utf8').digest(),
  );
  return keyringViewFromRecord('session-derived', { 'session-derived': material });
}

export function createMariaDbAdminDeps(
  env: EnvironmentSource = getProcessEnvironment(),
): AdminCrawlerDeps {
  const uow = new MariaDbCrawlerUnitOfWork();
  const cipher = resolveSecretCipher(env);
  return {
    uow,
    jobs: new CrawlerJobService(uow),
    schedules: new CrawlerScheduleService(uow),
    profiles: new CrawlerConfigService(new MariaDbCrawlerConfigRepository()),
    storage: new StorageConfigService(new MariaDbStorageConfigRepository()),
    secrets: new SecretService(new MariaDbSecretRepository(), cipher),
    yaml: new YamlImportService(),
    workers: new MariaDbWorkerRepository(),
  };
}

/**
 * Worker HTTP API deps against MariaDB.
 * Credential issuer is null by default: URL-only crawls do not need real S3/STS.
 * Wire an issuer later only when object upload + short-lived credentials are required.
 */
export function createMariaDbWorkerApiDeps(): WorkerApiDeps {
  const uow = new MariaDbCrawlerUnitOfWork();
  const workers = new MariaDbWorkerRepository();
  return {
    auth: new WorkerAuthService(workers),
    registry: new WorkerRegistryService(workers),
    jobs: new CrawlerJobService(uow),
    results: new CrawlerResultService(uow),
    logs: new CrawlerLogService(uow),
    media: new MediaReservationService(uow),
    credentials: new CredentialRefreshService(uow, null),
  };
}
