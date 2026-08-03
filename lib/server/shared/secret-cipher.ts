export type EncryptedSecretPayload = Readonly<{
  keyId: string;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
}>;

export interface SecretCipher {
  encrypt(plaintext: Uint8Array, aad: string): EncryptedSecretPayload;
  decrypt(payload: EncryptedSecretPayload, aad: string): Uint8Array;
}
