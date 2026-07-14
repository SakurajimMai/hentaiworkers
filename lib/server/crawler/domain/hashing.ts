import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** SHA-256 digest as 32-byte Uint8Array. */
export function sha256Bytes(input: string | Uint8Array): Uint8Array {
  const hash = createHash('sha256');
  if (typeof input === 'string') {
    hash.update(input, 'utf8');
  } else {
    hash.update(input);
  }
  return new Uint8Array(hash.digest());
}

/** Hash an opaque token (lease / machine / idempotency key material). */
export function hashOpaqueToken(token: string): Uint8Array {
  return sha256Bytes(token);
}

/**
 * Canonical request hash for idempotent write operations.
 * Keys are sorted for stable serialization of plain objects.
 */
export function hashRequestBody(body: unknown): Uint8Array {
  return sha256Bytes(stableStringify(body));
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(obj).sort()) {
        sorted[key] = obj[key];
      }
      return sorted;
    }
    return v;
  });
}

export function constantTimeEqualHash(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Generate a high-entropy lease token; only the hash is persisted. */
export function generateLeaseToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return constantTimeEqualHash(a, b);
}
