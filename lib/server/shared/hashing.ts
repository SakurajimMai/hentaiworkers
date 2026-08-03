import { createHash } from 'node:crypto';

/** SHA-256 digest as a 32-byte Uint8Array. */
export function sha256Bytes(input: string | Uint8Array): Uint8Array {
  const hash = createHash('sha256');
  hash.update(input);
  return new Uint8Array(hash.digest());
}
