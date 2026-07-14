import { AppError } from '../../shared/errors';
import type { SecretCipher } from '../ports/secret-cipher';
import type { SecretMeta, SecretRepository } from '../ports/config-repository';

export type SecretRevealResult = Readonly<{
  secretId: number;
  version: number;
  plaintext: string;
  cacheControl: 'no-store';
}>;

export type SecretListItem = Readonly<{
  id: number;
  name: string;
  scope: string;
  isRevoked: boolean;
  currentVersion: number | null;
  maskedValue: '••••••••';
}>;

export function buildSecretAad(secretId: number, version: number, scope: string): string {
  return `${secretId}:${version}:${scope}`;
}

export class SecretService {
  constructor(
    private readonly repository: SecretRepository,
    private readonly cipher: SecretCipher,
  ) {}

  async create(input: {
    name: string;
    scope: string;
    plaintext: string;
  }): Promise<SecretMeta> {
    const name = input.name.trim();
    const scope = input.scope.trim();
    if (!name || !scope || !input.plaintext) {
      throw new AppError('RESULT_INVALID', '名称、范围与明文必填', 400);
    }

    const meta = await this.repository.createMeta(name, scope);
    const version = 1;
    const encrypted = this.cipher.encrypt(
      new TextEncoder().encode(input.plaintext),
      buildSecretAad(meta.id, version, scope),
    );
    await this.repository.saveVersion({
      secretId: meta.id,
      version,
      keyId: encrypted.keyId,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
    });

    const updated = await this.repository.getMeta(meta.id);
    if (!updated) throw new AppError('INTERNAL_ERROR', '密钥创建失败', 500);
    return updated;
  }

  async rotate(secretId: number, plaintext: string): Promise<SecretMeta> {
    const meta = await this.repository.getMeta(secretId);
    if (!meta) throw new AppError('RESULT_INVALID', '密钥不存在', 404);
    if (meta.isRevoked) throw new AppError('SECRET_REVOKED', '密钥已撤销', 400);
    if (!plaintext) throw new AppError('RESULT_INVALID', '明文必填', 400);

    const nextVersion = (meta.currentVersion ?? 0) + 1;
    const encrypted = this.cipher.encrypt(
      new TextEncoder().encode(plaintext),
      buildSecretAad(secretId, nextVersion, meta.scope),
    );
    await this.repository.saveVersion({
      secretId,
      version: nextVersion,
      keyId: encrypted.keyId,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
    });

    const updated = await this.repository.getMeta(secretId);
    if (!updated) throw new AppError('INTERNAL_ERROR', '密钥更新失败', 500);
    return updated;
  }

  async reveal(secretId: number): Promise<SecretRevealResult> {
    const meta = await this.repository.getMeta(secretId);
    if (!meta) throw new AppError('RESULT_INVALID', '密钥不存在', 404);
    if (meta.isRevoked) throw new AppError('SECRET_REVOKED', '密钥已撤销', 400);

    const version = await this.repository.getCurrentVersion(secretId);
    if (!version || meta.currentVersion == null) {
      throw new AppError('RESULT_INVALID', '密钥版本不存在', 404);
    }

    const plaintextBytes = this.cipher.decrypt(
      {
        keyId: version.keyId,
        ciphertext: version.ciphertext,
        nonce: version.nonce,
        authTag: version.authTag,
      },
      buildSecretAad(secretId, version.version, meta.scope),
    );

    return {
      secretId,
      version: version.version,
      plaintext: new TextDecoder().decode(plaintextBytes),
      cacheControl: 'no-store',
    };
  }

  async revoke(secretId: number): Promise<void> {
    const meta = await this.repository.getMeta(secretId);
    if (!meta) throw new AppError('RESULT_INVALID', '密钥不存在', 404);
    await this.repository.revoke(secretId);
  }

  async list(): Promise<ReadonlyArray<SecretListItem>> {
    const rows = await this.repository.list();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      scope: row.scope,
      isRevoked: row.isRevoked,
      currentVersion: row.currentVersion,
      maskedValue: '••••••••' as const,
    }));
  }
}
