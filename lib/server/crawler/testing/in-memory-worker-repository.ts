import { AppError } from '../../shared/errors';
import { hashesEqual } from '../domain/hashing';
import type { WorkerCapabilities } from '../domain/worker-protocol';
import type {
  WorkerCredentialRecord,
  WorkerRecord,
  WorkerRepository,
} from '../ports/worker-repository';

function nowIso(): string {
  return new Date().toISOString();
}

export class InMemoryWorkerRepository implements WorkerRepository {
  private workerSeq = 1;
  private credSeq = 1;
  readonly workers = new Map<number, WorkerRecord>();
  readonly credentials = new Map<number, WorkerCredentialRecord>();

  async getWorker(workerId: number): Promise<WorkerRecord | null> {
    return this.workers.get(workerId) ?? null;
  }

  async listWorkers(): Promise<ReadonlyArray<WorkerRecord>> {
    return [...this.workers.values()];
  }

  async upsertRegistration(input: {
    workerId: number;
    name: string;
    version: string;
    capabilities: WorkerCapabilities;
  }): Promise<WorkerRecord> {
    const current = this.workers.get(input.workerId);
    if (!current) throw new AppError('RESULT_INVALID', 'Worker 不存在', 404);
    const next: WorkerRecord = {
      ...current,
      name: input.name,
      version: input.version,
      capabilitiesJson: JSON.stringify(input.capabilities),
      lastHeartbeatAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.workers.set(input.workerId, next);
    return next;
  }

  async heartbeat(input: {
    workerId: number;
    version?: string;
    capabilities?: WorkerCapabilities;
    currentLoad?: number;
  }): Promise<WorkerRecord> {
    const current = this.workers.get(input.workerId);
    if (!current) throw new AppError('RESULT_INVALID', 'Worker 不存在', 404);

    let capabilitiesJson = current.capabilitiesJson;
    if (input.capabilities) {
      capabilitiesJson = JSON.stringify(input.capabilities);
    } else if (input.currentLoad != null) {
      try {
        const caps = JSON.parse(current.capabilitiesJson) as WorkerCapabilities;
        capabilitiesJson = JSON.stringify({ ...caps, currentLoad: input.currentLoad });
      } catch {
        // keep previous
      }
    }

    const next: WorkerRecord = {
      ...current,
      version: input.version ?? current.version,
      capabilitiesJson,
      lastHeartbeatAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.workers.set(input.workerId, next);
    return next;
  }

  async findCredentialByTokenHash(
    tokenHash: Uint8Array,
  ): Promise<WorkerCredentialRecord | null> {
    for (const cred of this.credentials.values()) {
      if (hashesEqual(cred.tokenHash, tokenHash)) {
        return {
          ...cred,
          tokenHash: new Uint8Array(cred.tokenHash),
        };
      }
    }
    return null;
  }

  async listCredentials(
    workerId: number,
  ): Promise<ReadonlyArray<WorkerCredentialRecord>> {
    return [...this.credentials.values()]
      .filter((c) => c.workerId === workerId)
      .map((c) => ({ ...c, tokenHash: new Uint8Array(c.tokenHash) }));
  }

  async createWorkerWithToken(input: {
    name: string;
    tokenHash: Uint8Array;
    scopes: readonly string[];
    version?: string;
  }): Promise<{ worker: WorkerRecord; credential: WorkerCredentialRecord }> {
    const ts = nowIso();
    const worker: WorkerRecord = {
      id: this.workerSeq++,
      name: input.name,
      version: input.version ?? '0.0.0',
      capabilitiesJson: '{}',
      lastHeartbeatAt: null,
      isEnabled: true,
      createdAt: ts,
      updatedAt: ts,
    };
    this.workers.set(worker.id, worker);

    const credential: WorkerCredentialRecord = {
      id: this.credSeq++,
      workerId: worker.id,
      tokenHash: new Uint8Array(input.tokenHash),
      scopeJson: JSON.stringify([...input.scopes]),
      isRevoked: false,
      expiresAt: null,
      createdAt: ts,
      rotatedAt: null,
    };
    this.credentials.set(credential.id, credential);
    return {
      worker,
      credential: { ...credential, tokenHash: new Uint8Array(credential.tokenHash) },
    };
  }

  async revokeCredential(credentialId: number): Promise<void> {
    const current = this.credentials.get(credentialId);
    if (!current) return;
    this.credentials.set(credentialId, { ...current, isRevoked: true });
  }

  setEnabled(workerId: number, isEnabled: boolean): void {
    const current = this.workers.get(workerId);
    if (!current) return;
    this.workers.set(workerId, { ...current, isEnabled, updatedAt: nowIso() });
  }
}
