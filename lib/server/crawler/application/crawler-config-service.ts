import { AppError } from '../../shared/errors';
import {
  parseCrawlerProfileConfig,
  type CrawlerProfileConfig,
} from '../domain/config';
import type {
  CrawlerConfigRepository,
  ProfileVersionRecord,
} from '../ports/config-repository';

export class CrawlerConfigService {
  constructor(private readonly repository: CrawlerConfigRepository) {}

  async createProfile(name: string, configInput: unknown): Promise<ProfileVersionRecord> {
    const trimmed = name.trim();
    if (!trimmed) throw new AppError('RESULT_INVALID', '模板名称必填', 400);
    const config = parseCrawlerProfileConfig(configInput);
    return this.repository.createProfile(trimmed, config);
  }

  async updateProfile(profileId: number, configInput: unknown): Promise<ProfileVersionRecord> {
    const config = parseCrawlerProfileConfig(configInput);
    return this.repository.appendProfileVersion(profileId, config);
  }

  getVersion(versionId: number): Promise<ProfileVersionRecord | null> {
    return this.repository.getProfileVersion(versionId);
  }

  listVersions(profileId: number): Promise<ReadonlyArray<ProfileVersionRecord>> {
    return this.repository.listProfileVersions(profileId);
  }

  /**
   * Profile versions are immutable snapshots. Any attempt to overwrite fails.
   */
  async overwriteVersionForbidden(
    versionId: number,
    configInput: unknown,
  ): Promise<never> {
    const existing = await this.repository.getProfileVersion(versionId);
    if (!existing) throw new AppError('RESULT_INVALID', '版本不存在', 404);
    parseCrawlerProfileConfig(configInput);
    throw new AppError('RESULT_CONFLICT', '配置版本不可变，请创建新版本', 409, false, {
      versionId,
      existingVersion: existing.version,
    });
  }
}

export type { CrawlerProfileConfig };
