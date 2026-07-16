import { AppError } from '../../shared/errors';
import type { CrawlerProfileConfig, StorageConfig } from '../domain/config';
import type {
  CrawlerConfigRepository,
  ProfileVersionRecord,
  SecretMeta,
  SecretRepository,
  SecretVersionRecord,
  StorageConfigRepository,
  StorageVersionRecord,
} from '../ports/config-repository';

export class InMemoryCrawlerConfigRepository implements CrawlerConfigRepository {
  private profileSeq = 1;
  private versionSeq = 1;
  private readonly versions = new Map<number, ProfileVersionRecord>();
  private readonly profileCurrent = new Map<number, number>();
  private readonly profileNames = new Map<number, string>();

  async listProfiles() {
    return [...this.profileNames.entries()].map(([id, name]) => ({
      id,
      name,
      currentVersionId: this.profileCurrent.get(id) ?? null,
      isEnabled: true,
    }));
  }

  async createProfile(name: string, config: CrawlerProfileConfig): Promise<ProfileVersionRecord> {
    const profileId = this.profileSeq++;
    this.profileNames.set(profileId, name);
    return this.appendProfileVersion(profileId, config);
  }

  async appendProfileVersion(
    profileId: number,
    config: CrawlerProfileConfig,
  ): Promise<ProfileVersionRecord> {
    const existing = [...this.versions.values()].filter((v) => v.profileId === profileId);
    const version = existing.length + 1;
    const record: ProfileVersionRecord = {
      id: this.versionSeq++,
      profileId,
      version,
      schemaVersion: config.schemaVersion,
      config: structuredClone(config),
      createdAt: new Date().toISOString(),
    };
    this.versions.set(record.id, record);
    this.profileCurrent.set(profileId, record.id);
    return record;
  }

  async getProfileVersion(versionId: number): Promise<ProfileVersionRecord | null> {
    return this.versions.get(versionId) ?? null;
  }

  async listProfileVersions(profileId: number): Promise<ReadonlyArray<ProfileVersionRecord>> {
    return [...this.versions.values()]
      .filter((v) => v.profileId === profileId)
      .sort((a, b) => a.version - b.version);
  }
}

export class InMemoryStorageConfigRepository implements StorageConfigRepository {
  private profileSeq = 1;
  private versionSeq = 1;
  private readonly profiles = new Map<
    number,
    { name: string; driver: 's3' | 'sftp'; isEnabled: boolean; currentVersionId: number | null }
  >();
  private readonly versions = new Map<number, StorageVersionRecord>();
  private readonly activated = new Set<number>();

  async listProfiles() {
    return [...this.profiles.entries()].map(([id, p]) => ({
      id,
      name: p.name,
      driver: p.driver,
      isEnabled: p.isEnabled,
      currentVersionId: p.currentVersionId,
    }));
  }

  async createProfile(name: string, config: StorageConfig): Promise<StorageVersionRecord> {
    const profileId = this.profileSeq++;
    this.profiles.set(profileId, {
      name,
      driver: config.driver,
      isEnabled: true,
      currentVersionId: null,
    });
    return this.appendVersion(profileId, config);
  }

  async appendVersion(profileId: number, config: StorageConfig): Promise<StorageVersionRecord> {
    if (!this.profiles.has(profileId)) {
      this.profiles.set(profileId, {
        name: `profile-${profileId}`,
        driver: config.driver,
        isEnabled: true,
        currentVersionId: null,
      });
    }
    const existing = [...this.versions.values()].filter((v) => v.profileId === profileId);
    const record: StorageVersionRecord = {
      id: this.versionSeq++,
      profileId,
      version: existing.length + 1,
      config: structuredClone(config),
      storageTestPassed: false,
      createdAt: new Date().toISOString(),
    };
    this.versions.set(record.id, record);
    return record;
  }

  async getVersion(versionId: number): Promise<StorageVersionRecord | null> {
    return this.versions.get(versionId) ?? null;
  }

  async listVersions(profileId: number): Promise<ReadonlyArray<StorageVersionRecord>> {
    return [...this.versions.values()]
      .filter((v) => v.profileId === profileId)
      .sort((a, b) => a.version - b.version);
  }

  async markStorageTestPassed(versionId: number): Promise<void> {
    const current = this.versions.get(versionId);
    if (!current) throw new AppError('RESULT_INVALID', '版本不存在', 404);
    this.versions.set(versionId, { ...current, storageTestPassed: true });
  }

  async activateVersion(versionId: number): Promise<void> {
    const current = this.versions.get(versionId);
    if (!current) throw new AppError('RESULT_INVALID', '版本不存在', 404);
    this.activated.add(versionId);
    const profile = this.profiles.get(current.profileId);
    if (profile) {
      this.profiles.set(current.profileId, {
        ...profile,
        currentVersionId: versionId,
      });
    }
  }

  isActivated(versionId: number): boolean {
    return this.activated.has(versionId);
  }
}

export class InMemorySecretRepository implements SecretRepository {
  private seq = 1;
  private versionSeq = 1;
  private readonly meta = new Map<number, SecretMeta>();
  private readonly versions = new Map<string, SecretVersionRecord>();

  private key(secretId: number, version: number) {
    return `${secretId}:${version}`;
  }

  async createMeta(name: string, scope: string): Promise<SecretMeta> {
    const id = this.seq++;
    const row: SecretMeta = {
      id,
      name,
      scope,
      isRevoked: false,
      currentVersion: null,
    };
    this.meta.set(id, row);
    return row;
  }

  async saveVersion(input: {
    secretId: number;
    version: number;
    keyId: string;
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    authTag: Uint8Array;
  }): Promise<SecretVersionRecord> {
    const meta = this.meta.get(input.secretId);
    if (!meta) throw new AppError('RESULT_INVALID', '密钥不存在', 404);
    if (this.versions.has(this.key(input.secretId, input.version)) && meta.currentVersion === input.version) {
      // allow first write of same version once when current was null
    }
    const record: SecretVersionRecord = {
      id: this.versionSeq++,
      secretId: input.secretId,
      version: input.version,
      keyId: input.keyId,
      ciphertext: new Uint8Array(input.ciphertext),
      nonce: new Uint8Array(input.nonce),
      authTag: new Uint8Array(input.authTag),
    };
    this.versions.set(this.key(input.secretId, input.version), record);
    this.meta.set(input.secretId, {
      ...meta,
      currentVersion: input.version,
    });
    return record;
  }

  async getMeta(secretId: number): Promise<SecretMeta | null> {
    return this.meta.get(secretId) ?? null;
  }

  async getCurrentVersion(secretId: number): Promise<SecretVersionRecord | null> {
    const meta = this.meta.get(secretId);
    if (!meta?.currentVersion) return null;
    return this.versions.get(this.key(secretId, meta.currentVersion)) ?? null;
  }

  async revoke(secretId: number): Promise<void> {
    const meta = this.meta.get(secretId);
    if (!meta) return;
    this.meta.set(secretId, { ...meta, isRevoked: true });
  }

  async list(): Promise<ReadonlyArray<SecretMeta>> {
    return [...this.meta.values()];
  }
}
