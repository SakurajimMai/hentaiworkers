import { AppError } from '../../shared/errors';
import {
  parseStorageConfig,
  type StorageConfig,
} from '../domain/config';
import type {
  StorageConfigRepository,
  StorageVersionRecord,
} from '../ports/config-repository';

export class StorageConfigService {
  constructor(private readonly repository: StorageConfigRepository) {}

  async createDraft(name: string, configInput: unknown): Promise<StorageVersionRecord> {
    const trimmed = name.trim();
    if (!trimmed) throw new AppError('RESULT_INVALID', '存储配置名称必填', 400);
    const config = parseStorageConfig(configInput);
    return this.repository.createProfile(trimmed, config);
  }

  async appendDraft(profileId: number, configInput: unknown): Promise<StorageVersionRecord> {
    const config = parseStorageConfig(configInput);
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
}

export type { StorageConfig };
