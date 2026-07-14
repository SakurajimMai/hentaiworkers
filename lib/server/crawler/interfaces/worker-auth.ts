import { AppError } from '../../shared/errors';
import { hashOpaqueToken, hashesEqual } from '../domain/hashing';
import type { WorkerCredentialRecord, WorkerRecord, WorkerRepository } from '../ports/worker-repository';

export const WORKER_SCOPES = [
  'workers:register',
  'workers:heartbeat',
  'jobs:claim',
  'jobs:write',
  'jobs:credentials',
] as const;

export type WorkerScope = (typeof WORKER_SCOPES)[number];

export type AuthenticatedWorker = Readonly<{
  worker: WorkerRecord;
  credential: WorkerCredentialRecord;
  scopes: readonly string[];
  tokenHash: Uint8Array;
}>;

const BEARER = /^Bearer\s+(\S+)$/i;

export function extractBearerToken(authorizationHeader: string | null): string {
  if (!authorizationHeader) {
    throw new AppError('WORKER_TOKEN_INVALID', '缺少 Authorization Bearer 令牌', 401);
  }
  const match = authorizationHeader.match(BEARER);
  if (!match?.[1]) {
    throw new AppError('WORKER_TOKEN_INVALID', 'Authorization 必须是 Bearer 令牌', 401);
  }
  return match[1];
}

export function parseScopes(scopeJson: string): readonly string[] {
  try {
    const parsed = JSON.parse(scopeJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String);
  } catch {
    return [];
  }
}

export class WorkerAuthService {
  constructor(private readonly workers: WorkerRepository) {}

  async authenticate(authorizationHeader: string | null): Promise<AuthenticatedWorker> {
    const token = extractBearerToken(authorizationHeader);
    const tokenHash = hashOpaqueToken(token);
    const credential = await this.workers.findCredentialByTokenHash(tokenHash);

    if (!credential) {
      throw new AppError('WORKER_TOKEN_INVALID', '机器令牌无效', 401);
    }
    if (credential.isRevoked) {
      throw new AppError('WORKER_TOKEN_REVOKED', '机器令牌已撤销', 401);
    }
    if (credential.expiresAt && credential.expiresAt <= new Date().toISOString()) {
      throw new AppError('WORKER_TOKEN_INVALID', '机器令牌已过期', 401);
    }

    const worker = await this.workers.getWorker(credential.workerId);
    if (!worker || !worker.isEnabled) {
      throw new AppError('WORKER_FORBIDDEN', 'Worker 已禁用或不存在', 403);
    }

    // Constant-time compare already done via hash lookup; re-check hash length.
    if (!hashesEqual(credential.tokenHash, tokenHash)) {
      throw new AppError('WORKER_TOKEN_INVALID', '机器令牌无效', 401);
    }

    return {
      worker,
      credential,
      scopes: parseScopes(credential.scopeJson),
      tokenHash,
    };
  }

  requireScope(auth: AuthenticatedWorker, scope: WorkerScope): void {
    if (!auth.scopes.includes(scope) && !auth.scopes.includes('*')) {
      throw new AppError('WORKER_FORBIDDEN', `缺少权限范围 ${scope}`, 403, false, {
        scope,
      });
    }
  }

  /**
   * Machine token is bound to a fixed worker_id. URL/body identity must match.
   */
  requireWorkerMatch(auth: AuthenticatedWorker, workerId: number): void {
    if (auth.worker.id !== workerId) {
      throw new AppError('WORKER_FORBIDDEN', 'Worker 身份与令牌绑定不一致', 403, false, {
        tokenWorkerId: auth.worker.id,
        requestedWorkerId: workerId,
      });
    }
  }
}

export const LEASE_TOKEN_HEADER = 'x-crawler-lease-token';

export function extractLeaseToken(
  headers: { get(name: string): string | null },
  bodyLeaseToken?: string | null,
): string {
  const fromHeader = headers.get(LEASE_TOKEN_HEADER) ?? headers.get('X-Crawler-Lease-Token');
  const token = fromHeader?.trim() || bodyLeaseToken?.trim();
  if (!token) {
    throw new AppError('LEASE_LOST', '缺少租约令牌', 409);
  }
  return token;
}
