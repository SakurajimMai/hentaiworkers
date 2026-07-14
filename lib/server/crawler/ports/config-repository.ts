import type { CrawlerProfileConfig, StorageConfig } from '../domain/config';

export type ProfileVersionRecord = Readonly<{
  id: number;
  profileId: number;
  version: number;
  schemaVersion: number;
  config: CrawlerProfileConfig;
  createdAt: string;
}>;

export type StorageVersionRecord = Readonly<{
  id: number;
  profileId: number;
  version: number;
  config: StorageConfig;
  storageTestPassed: boolean;
  createdAt: string;
}>;

export type SecretMeta = Readonly<{
  id: number;
  name: string;
  scope: string;
  isRevoked: boolean;
  currentVersion: number | null;
}>;

export type SecretVersionRecord = Readonly<{
  id: number;
  secretId: number;
  version: number;
  keyId: string;
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
}>;

export interface CrawlerConfigRepository {
  createProfile(name: string, config: CrawlerProfileConfig): Promise<ProfileVersionRecord>;
  appendProfileVersion(profileId: number, config: CrawlerProfileConfig): Promise<ProfileVersionRecord>;
  getProfileVersion(versionId: number): Promise<ProfileVersionRecord | null>;
  listProfileVersions(profileId: number): Promise<ReadonlyArray<ProfileVersionRecord>>;
}

export interface StorageConfigRepository {
  createProfile(name: string, config: StorageConfig): Promise<StorageVersionRecord>;
  appendVersion(profileId: number, config: StorageConfig): Promise<StorageVersionRecord>;
  getVersion(versionId: number): Promise<StorageVersionRecord | null>;
  markStorageTestPassed(versionId: number): Promise<void>;
  activateVersion(versionId: number): Promise<void>;
}

export interface SecretRepository {
  createMeta(name: string, scope: string): Promise<SecretMeta>;
  saveVersion(input: {
    secretId: number;
    version: number;
    keyId: string;
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    authTag: Uint8Array;
  }): Promise<SecretVersionRecord>;
  getMeta(secretId: number): Promise<SecretMeta | null>;
  getCurrentVersion(secretId: number): Promise<SecretVersionRecord | null>;
  revoke(secretId: number): Promise<void>;
  list(): Promise<ReadonlyArray<SecretMeta>>;
}
