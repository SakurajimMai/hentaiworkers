import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../shared/errors';
import type {
  EncryptedSecretPayload,
  SecretCipher,
} from '../../shared/secret-cipher';

export type EncryptionKeyringView = Readonly<{
  currentKeyId: string;
  /** Always returns a fresh copy of key material. */
  getKey(keyId: string): Uint8Array;
  listKeyIds(): readonly string[];
}>;

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes);
}

export function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(toBuffer(a), toBuffer(b));
}

/**
 * AES-256-GCM secret cipher.
 * - 96-bit random nonce per encryption
 * - AAD binds ciphertext to secretId:version:scope
 * - Decrypt tries historical keys by payload.keyId
 */
export class AesGcmSecretCipher implements SecretCipher {
  constructor(private readonly keyring: EncryptionKeyringView) {}

  encrypt(plaintext: Uint8Array, aad: string): EncryptedSecretPayload {
    const keyId = this.keyring.currentKeyId;
    const key = this.keyring.getKey(keyId);
    if (key.byteLength !== 32) {
      throw new AppError('CONFIG_INVALID', '加密密钥长度无效', 500);
    }

    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', toBuffer(key), nonce);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(toBuffer(plaintext)),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      keyId,
      ciphertext: new Uint8Array(ciphertext),
      nonce: new Uint8Array(nonce),
      authTag: new Uint8Array(authTag),
    };
  }

  decrypt(payload: EncryptedSecretPayload, aad: string): Uint8Array {
    if (payload.nonce.byteLength !== 12 || payload.authTag.byteLength !== 16) {
      throw new AppError('SECRET_REVOKED', '密文格式无效', 400);
    }
    if (!this.keyring.listKeyIds().includes(payload.keyId)) {
      throw new AppError('SECRET_REVOKED', '解密密钥不可用', 400);
    }

    try {
      const key = this.keyring.getKey(payload.keyId);
      const decipher = createDecipheriv(
        'aes-256-gcm',
        toBuffer(key),
        toBuffer(payload.nonce),
      );
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(toBuffer(payload.authTag));
      const plaintext = Buffer.concat([
        decipher.update(toBuffer(payload.ciphertext)),
        decipher.final(),
      ]);
      return new Uint8Array(plaintext);
    } catch {
      throw new AppError('SECRET_REVOKED', '解密失败或 AAD 不匹配', 400);
    }
  }
}

export function keyringViewFromRecord(
  currentKeyId: string,
  keys: Readonly<Record<string, Uint8Array>>,
): EncryptionKeyringView {
  return {
    currentKeyId,
    getKey(keyId: string) {
      const material = keys[keyId];
      if (!material) {
        throw new AppError('CONFIG_INVALID', '密钥不存在', 500);
      }
      return new Uint8Array(material);
    },
    listKeyIds() {
      return Object.keys(keys);
    },
  };
}
