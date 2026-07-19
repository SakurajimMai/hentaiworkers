import { AppError } from '../../shared/errors';
import {
  parseCrawlerProfileConfig,
  type CrawlerProfileConfig,
} from '../domain/config';
import type {
  CrawlerConfigRepository,
  ProfileSummary,
  ProfileVersionRecord,
} from '../ports/config-repository';

function requirePositiveProfileId(profileId: number): void {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    throw new AppError('RESULT_INVALID', '无效模板 ID', 400);
  }
}

export class CrawlerConfigService {
  constructor(private readonly repository: CrawlerConfigRepository) {}

  listProfiles() {
    return this.repository.listProfiles();
  }

  async createProfile(name: string, configInput: unknown): Promise<ProfileVersionRecord> {
    const trimmed = name.trim();
    if (!trimmed) throw new AppError('RESULT_INVALID', '模板名称必填', 400);
    const config = parseCrawlerProfileConfig(configInput);
    return this.repository.createProfile(trimmed, config);
  }

  async getProfile(profileId: number): Promise<ProfileSummary | null> {
    requirePositiveProfileId(profileId);
    return this.repository.getProfile(profileId);
  }

  async editProfile(
    profileId: number,
    name: string,
    configInput: unknown,
  ): Promise<ProfileVersionRecord> {
    requirePositiveProfileId(profileId);
    const trimmed = name.trim();
    if (!trimmed) throw new AppError('RESULT_INVALID', '模板名称必填', 400);
    const config = parseCrawlerProfileConfig(configInput);
    return this.repository.updateProfile(profileId, trimmed, config);
  }

  async disableProfile(profileId: number): Promise<void> {
    requirePositiveProfileId(profileId);
    await this.repository.disableProfile(profileId);
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
