import type { WorkerCapabilities } from '../domain/worker-protocol';

export type WorkerRecord = Readonly<{
  id: number;
  name: string;
  version: string;
  capabilitiesJson: string;
  lastHeartbeatAt: string | null;
  isEnabled: boolean;
  claimEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type WorkerClaimControlRecord = Readonly<{
  id: number;
  isEnabled: boolean;
  claimEnabled: boolean;
}>;

export interface WorkerClaimControlRepository {
  getForUpdate(workerId: number): Promise<WorkerClaimControlRecord | null>;
}

export interface WorkerTransactionalRepository extends WorkerClaimControlRepository {
  rotateCredential(
    workerId: number,
    tokenHash: Uint8Array,
    scopes: readonly string[],
  ): Promise<WorkerCredentialRecord>;
  revokeCredentialForWorker(workerId: number, credentialId: number): Promise<void>;
}

export type WorkerCredentialRecord = Readonly<{
  id: number;
  workerId: number;
  tokenHash: Uint8Array;
  /** JSON array of scope strings, e.g. ["jobs:claim","jobs:write"]. */
  scopeJson: string;
  isRevoked: boolean;
  expiresAt: string | null;
  createdAt: string;
  rotatedAt: string | null;
}>;

export interface WorkerRepository extends WorkerTransactionalRepository {
  getWorker(workerId: number): Promise<WorkerRecord | null>;
  listWorkers(): Promise<ReadonlyArray<WorkerRecord>>;
  upsertRegistration(input: {
    workerId: number;
    name: string;
    version: string;
    capabilities: WorkerCapabilities;
  }): Promise<WorkerRecord>;
  heartbeat(input: {
    workerId: number;
    version?: string;
    capabilities?: WorkerCapabilities;
    currentLoad?: number;
  }): Promise<WorkerRecord>;
  findCredentialByTokenHash(
    tokenHash: Uint8Array,
  ): Promise<WorkerCredentialRecord | null>;
  listCredentials(workerId: number): Promise<ReadonlyArray<WorkerCredentialRecord>>;
  /** Test/admin bootstrap: create worker shell + credential. */
  createWorkerWithToken(input: {
    name: string;
    tokenHash: Uint8Array;
    scopes: readonly string[];
    version?: string;
  }): Promise<{ worker: WorkerRecord; credential: WorkerCredentialRecord }>;
  setClaimEnabled(workerId: number, enabled: boolean): Promise<WorkerRecord>;
  rotateCredential(
    workerId: number,
    tokenHash: Uint8Array,
    scopes: readonly string[],
  ): Promise<WorkerCredentialRecord>;
  setEnabled(workerId: number, enabled: boolean): Promise<WorkerRecord>;
  /** Low-level test/bootstrap revocation; admin flows use revokeCredentialForWorker. */
  revokeCredential(credentialId: number): Promise<void>;
}
