import { z } from 'zod';

/** Supported control-plane protocol versions (N and N-1 during rollouts). */
export const SUPPORTED_PROTOCOL_VERSIONS = [1] as const;
export type ProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

export const CURRENT_PROTOCOL_VERSION: ProtocolVersion = 1;

export const workerCapabilitiesSchema = z.object({
  protocolVersion: z.number().int().positive(),
  workerVersion: z.string().min(1).max(64),
  sources: z.array(z.string().min(1)).min(1),
  storageDrivers: z.array(z.enum(['s3', 'sftp'])).default([]),
  configSchemaVersions: z.array(z.number().int().positive()).min(1),
  maxConcurrency: z.number().int().min(1).max(64),
  currentLoad: z.number().int().min(0).max(64).default(0),
  browserVersion: z.string().max(64).optional(),
});

export type WorkerCapabilities = z.infer<typeof workerCapabilitiesSchema>;

export type JobCapabilityRequirements = Readonly<{
  source?: string;
  storageDriver?: 's3' | 'sftp';
  configSchemaVersion?: number;
}>;

export function isProtocolSupported(version: number): version is ProtocolVersion {
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly number[]).includes(version);
}

/**
 * Decide whether a Worker may claim a job based on advertised capabilities.
 * Incompatible jobs stay queued with a visible skip reason for the admin UI.
 */
export function evaluateJobCompatibility(
  requirements: JobCapabilityRequirements,
  capabilities: WorkerCapabilities,
): { ok: true } | { ok: false; reason: string } {
  if (!isProtocolSupported(capabilities.protocolVersion)) {
    return {
      ok: false,
      reason: `不支持的协议版本 ${capabilities.protocolVersion}`,
    };
  }
  if (
    requirements.source
    && !capabilities.sources.includes(requirements.source)
  ) {
    return {
      ok: false,
      reason: `Worker 不支持来源 ${requirements.source}`,
    };
  }
  if (
    requirements.storageDriver
    && !capabilities.storageDrivers.includes(requirements.storageDriver)
  ) {
    return {
      ok: false,
      reason: `Worker 不支持存储驱动 ${requirements.storageDriver}`,
    };
  }
  if (
    requirements.configSchemaVersion != null
    && !capabilities.configSchemaVersions.includes(requirements.configSchemaVersion)
  ) {
    return {
      ok: false,
      reason: `Worker 不支持配置 schema v${requirements.configSchemaVersion}`,
    };
  }
  if (capabilities.currentLoad >= capabilities.maxConcurrency) {
    return { ok: false, reason: 'Worker 已达并发上限' };
  }
  return { ok: true };
}

/** Best-effort parse of job snapshot for capability requirements. */
export function parseJobRequirements(
  configSnapshotJson: string,
): JobCapabilityRequirements {
  try {
    const parsed = JSON.parse(configSnapshotJson) as Record<string, unknown>;
    const source =
      typeof parsed.source === 'string'
        ? parsed.source
        : typeof (parsed.source as { name?: string } | undefined)?.name === 'string'
          ? (parsed.source as { name: string }).name
          : typeof (parsed as { requiredSource?: string }).requiredSource === 'string'
            ? (parsed as { requiredSource: string }).requiredSource
            : undefined;

    const storageDriver =
      parsed.storageDriver === 's3' || parsed.storageDriver === 'sftp'
        ? parsed.storageDriver
        : undefined;

    const configSchemaVersion =
      typeof parsed.schemaVersion === 'number'
        ? parsed.schemaVersion
        : typeof parsed.configSchemaVersion === 'number'
          ? parsed.configSchemaVersion
          : undefined;

    return { source, storageDriver, configSchemaVersion };
  } catch {
    return {};
  }
}
