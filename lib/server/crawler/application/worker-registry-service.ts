import { AppError } from '../../shared/errors';
import {
  evaluateJobCompatibility,
  isProtocolSupported,
  workerCapabilitiesSchema,
  type WorkerCapabilities,
} from '../domain/worker-protocol';
import type { WorkerRecord, WorkerRepository } from '../ports/worker-repository';

export class WorkerRegistryService {
  constructor(private readonly workers: WorkerRepository) {}

  async register(input: {
    workerId: number;
    name?: string;
    capabilities: unknown;
  }): Promise<{
    worker: WorkerRecord;
    protocolVersion: number;
  }> {
    const capabilities = workerCapabilitiesSchema.parse(input.capabilities);
    if (!isProtocolSupported(capabilities.protocolVersion)) {
      throw new AppError(
        'WORKER_INCOMPATIBLE',
        `不支持的协议版本 ${capabilities.protocolVersion}`,
        409,
        false,
        { protocolVersion: capabilities.protocolVersion },
      );
    }

    const worker = await this.workers.getWorker(input.workerId);
    if (!worker) {
      throw new AppError('RESULT_INVALID', 'Worker 不存在', 404);
    }
    if (!worker.isEnabled) {
      throw new AppError('WORKER_FORBIDDEN', 'Worker 已禁用', 403);
    }

    const updated = await this.workers.upsertRegistration({
      workerId: input.workerId,
      name: input.name?.trim() || worker.name,
      version: capabilities.workerVersion,
      capabilities,
    });

    return {
      worker: updated,
      protocolVersion: capabilities.protocolVersion,
    };
  }

  async heartbeat(input: {
    workerId: number;
    capabilities?: unknown;
    currentLoad?: number;
    version?: string;
  }): Promise<WorkerRecord> {
    const worker = await this.workers.getWorker(input.workerId);
    if (!worker) {
      throw new AppError('RESULT_INVALID', 'Worker 不存在', 404);
    }

    let capabilities: WorkerCapabilities | undefined;
    if (input.capabilities !== undefined) {
      capabilities = workerCapabilitiesSchema.parse(input.capabilities);
      if (!isProtocolSupported(capabilities.protocolVersion)) {
        throw new AppError(
          'WORKER_INCOMPATIBLE',
          `不支持的协议版本 ${capabilities.protocolVersion}`,
          409,
        );
      }
    }

    return this.workers.heartbeat({
      workerId: input.workerId,
      version: input.version ?? capabilities?.workerVersion,
      capabilities,
      currentLoad: input.currentLoad ?? capabilities?.currentLoad,
    });
  }

  /** Expose for claim-path prechecks. */
  static checkCompatibility(
    requirements: Parameters<typeof evaluateJobCompatibility>[0],
    capabilities: WorkerCapabilities,
  ) {
    return evaluateJobCompatibility(requirements, capabilities);
  }
}
