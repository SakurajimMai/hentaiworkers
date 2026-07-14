export {
  CRAWLER_JOB_KINDS,
  CRAWLER_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  createManualRetrySeed,
  isTerminalJobStatus,
  resolveFinalStatus,
  transitionJobStatus,
  type CrawlerJobKind,
  type CrawlerJobStatus,
  type JobTransitionEvent,
  type JobTransitionResult,
} from './domain/job';

export {
  DEFAULT_CATCH_UP_LIMIT,
  canStartAdditionalJob,
  computeNextRunAt,
  countOverduePoints,
  isValidFiveFieldCron,
  isValidIanaTimezone,
  materializeMisfirePoints,
  nextFiveFieldCronUtc,
  shouldMaterializeOccurrence,
  validateScheduleDefinition,
  type MisfirePolicy,
  type OverlapPolicy,
  type ScheduleDefinition,
  type ScheduleKind,
} from './domain/schedule';

export {
  constantTimeEqualHash,
  generateLeaseToken,
  hashOpaqueToken,
  hashRequestBody,
  hashesEqual,
  sha256Bytes,
  stableStringify,
} from './domain/hashing';

export { buildMediaObjectKeys } from './domain/media-paths';

export {
  canonicalizeJson,
  crawlerProfileConfigSchema,
  parseCrawlerProfileConfig,
  parseStorageConfig,
  storageConfigSchema,
  type CrawlerProfileConfig,
  type StorageConfig,
} from './domain/config';

export {
  buildSecretAad,
  SecretService,
  type SecretListItem,
  type SecretRevealResult,
} from './application/secret-service';

export { CrawlerConfigService } from './application/crawler-config-service';
export { StorageConfigService } from './application/storage-config-service';
export {
  YAML_IMPORT_MAX_BYTES,
  YAML_IMPORT_MAX_DEPTH,
  YamlImportService,
  type YamlImportPreview,
  type YamlPreviewItem,
} from './application/yaml-import-service';

export type {
  EncryptedSecretPayload,
  SecretCipher,
} from './ports/secret-cipher';

export type {
  CrawlerConfigRepository,
  ProfileVersionRecord,
  SecretMeta,
  SecretRepository,
  SecretVersionRecord,
  StorageConfigRepository,
  StorageVersionRecord,
} from './ports/config-repository';

export { CrawlerScheduleService } from './application/crawler-schedule-service';
export { CrawlerJobService } from './application/crawler-job-service';
export { CrawlerResultService } from './application/crawler-result-service';
export {
  CrawlerLogService,
  MAX_EVENT_BATCH_BYTES,
  MAX_EVENT_BATCH_COUNT,
} from './application/crawler-log-service';
export { MediaReservationService } from './application/media-reservation-service';
export { withOperationReceipt } from './application/operation-receipts';
export { assertValidLease } from './application/lease-guard';

export type {
  AttemptRecord,
  CrawlerJobRepository,
  CrawlerRepositories,
  CrawlerScheduleRepository,
  CrawlerUnitOfWork,
  JobEventRecord,
  JobItemRecord,
  JobRecord,
  MediaUploadRecord,
  OperationReceiptRecord,
  ScheduleRecord,
} from './ports/crawler-unit-of-work';

export {
  CURRENT_PROTOCOL_VERSION,
  evaluateJobCompatibility,
  isProtocolSupported,
  parseJobRequirements,
  SUPPORTED_PROTOCOL_VERSIONS,
  workerCapabilitiesSchema,
  type WorkerCapabilities,
} from './domain/worker-protocol';

export {
  extractBearerToken,
  extractLeaseToken,
  LEASE_TOKEN_HEADER,
  WorkerAuthService,
  WORKER_SCOPES,
} from './interfaces/worker-auth';

export {
  mapWorkerError,
  presentWorkerEmpty,
  presentWorkerError,
  presentWorkerOk,
} from './interfaces/worker-presenter';

export { createWorkerHandlers } from './interfaces/create-worker-handlers';
export {
  getWorkerApiDeps,
  setWorkerApiDeps,
  setWorkerApiDepsForTests,
  type WorkerApiDeps,
} from './interfaces/worker-api-deps';

export {
  createMariaDbAdminDeps,
  createMariaDbWorkerApiDeps,
  resolveSecretCipher,
} from './interfaces/compose-mariadb-crawler';

export { WorkerRegistryService } from './application/worker-registry-service';
export { CredentialRefreshService } from './application/credential-refresh-service';
