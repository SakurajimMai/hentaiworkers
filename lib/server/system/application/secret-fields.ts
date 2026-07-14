import type { SecretCipher } from '../../crawler/ports/secret-cipher';
import type { EncryptedField } from '../domain/settings';

const AAD_SMTP = 'system:smtp:password';
const AAD_TURNSTILE = 'system:turnstile:secret';

export function encryptSecretField(
  cipher: SecretCipher,
  plaintext: string,
  aad: string,
): EncryptedField {
  const payload = cipher.encrypt(new TextEncoder().encode(plaintext), aad);
  return {
    keyId: payload.keyId,
    ciphertextB64: Buffer.from(payload.ciphertext).toString('base64'),
    nonceB64: Buffer.from(payload.nonce).toString('base64'),
    authTagB64: Buffer.from(payload.authTag).toString('base64'),
  };
}

export function decryptSecretField(
  cipher: SecretCipher,
  field: EncryptedField,
  aad: string,
): string {
  const plain = cipher.decrypt(
    {
      keyId: field.keyId,
      ciphertext: new Uint8Array(Buffer.from(field.ciphertextB64, 'base64')),
      nonce: new Uint8Array(Buffer.from(field.nonceB64, 'base64')),
      authTag: new Uint8Array(Buffer.from(field.authTagB64, 'base64')),
    },
    aad,
  );
  return new TextDecoder().decode(plain);
}

export function encryptSmtpPassword(cipher: SecretCipher, plaintext: string): EncryptedField {
  return encryptSecretField(cipher, plaintext, AAD_SMTP);
}

export function decryptSmtpPassword(cipher: SecretCipher, field: EncryptedField): string {
  return decryptSecretField(cipher, field, AAD_SMTP);
}

export function encryptTurnstileSecret(cipher: SecretCipher, plaintext: string): EncryptedField {
  return encryptSecretField(cipher, plaintext, AAD_TURNSTILE);
}

export function decryptTurnstileSecret(cipher: SecretCipher, field: EncryptedField): string {
  return decryptSecretField(cipher, field, AAD_TURNSTILE);
}
