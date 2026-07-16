import { AppError } from '../../shared/errors';
import {
  parseStorageConfig,
  type StorageConfig,
} from '../domain/config';
import type {
  StorageConfigRepository,
  StorageProfileSummary,
  StorageVersionRecord,
} from '../ports/config-repository';

export class StorageConfigService {
  constructor(private readonly repository: StorageConfigRepository) {}

  listProfiles(): Promise<ReadonlyArray<StorageProfileSummary>> {
    return this.repository.listProfiles();
  }

  listVersions(profileId: number): Promise<ReadonlyArray<StorageVersionRecord>> {
    return this.repository.listVersions(profileId);
  }

  async createDraft(name: string, configInput: unknown): Promise<StorageVersionRecord> {
    const trimmed = name.trim();
    if (!trimmed) throw new AppError('RESULT_INVALID', '存储配置名称必填', 400);
    const config = parseStorageConfig(configInput);
    assertPlaybackStorage(config);
    return this.repository.createProfile(trimmed, config);
  }

  async appendDraft(profileId: number, configInput: unknown): Promise<StorageVersionRecord> {
    const config = parseStorageConfig(configInput);
    assertPlaybackStorage(config);
    return this.repository.appendVersion(profileId, config);
  }

  getVersion(versionId: number): Promise<StorageVersionRecord | null> {
    return this.repository.getVersion(versionId);
  }

  markStorageTestPassed(versionId: number): Promise<void> {
    return this.repository.markStorageTestPassed(versionId);
  }

  /**
   * Only versions that passed a Worker storage_test job may be activated.
   */
  async activate(versionId: number): Promise<void> {
    const version = await this.repository.getVersion(versionId);
    if (!version) throw new AppError('RESULT_INVALID', '存储版本不存在', 404);
    if (!version.storageTestPassed) {
      throw new AppError(
        'RESULT_CONFLICT',
        '存储配置须先通过 storage_test 任务才能激活',
        409,
      );
    }
    await this.repository.activateVersion(versionId);
  }

  /** Active version for a storage profile, if any. */
  async getActiveVersion(profileId: number): Promise<StorageVersionRecord | null> {
    const profiles = await this.repository.listProfiles();
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile?.currentVersionId) return null;
    return this.repository.getVersion(profile.currentVersionId);
  }

  /** First enabled profile with an activated version matching the driver. */
  async findActiveByDriver(
    driver: 's3' | 'sftp',
  ): Promise<StorageVersionRecord | null> {
    const profiles = await this.repository.listProfiles();
    for (const profile of profiles) {
      if (!profile.isEnabled || profile.driver !== driver || !profile.currentVersionId) {
        continue;
      }
      const version = await this.repository.getVersion(profile.currentVersionId);
      if (version?.storageTestPassed) return version;
    }
    return null;
  }
}

function assertPlaybackStorage(config: StorageConfig): void {
  if (!config.publicBaseUrl) {
    throw new AppError(
      'RESULT_INVALID',
      'Hanime 存储必须配置 Public Base URL，供播放器访问发布后的对象',
      400,
    );
  }
  if (config.driver === 's3' && config.deliveryMode === 'private') {
    throw new AppError(
      'RESULT_INVALID',
      '当前播放器尚未启用私有对象签名路由，请选择 public 或 cdn',
      400,
    );
  }
}

export type { StorageConfig };
