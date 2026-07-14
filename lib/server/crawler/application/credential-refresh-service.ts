import { AppError } from '../../shared/errors';
import { assertValidLease, type LeaseBinding } from './lease-guard';
import type { CrawlerUnitOfWork } from '../ports/crawler-unit-of-work';

export type ShortLivedStorageCredentials = Readonly<{
  driver: 's3';
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: string;
  prefix: string;
  bucket: string;
  region: string;
  endpoint?: string;
}>;

/**
 * Refresh short-lived storage credentials for the current job lease only.
 * Does not expose long-lived secrets; revoked secret versions must fail.
 */
export type CredentialIssuer = (input: {
  jobId: number;
  prefix: string;
}) => Promise<ShortLivedStorageCredentials | null>;

export class CredentialRefreshService {
  constructor(
    private readonly uow: CrawlerUnitOfWork,
    private readonly issueCredentials: CredentialIssuer | null = null,
  ) {}

  async refresh(
    binding: LeaseBinding,
    options?: { prefix?: string },
  ): Promise<ShortLivedStorageCredentials> {
    return this.uow.runInTransaction(async (repos) => {
      await assertValidLease(repos, binding);
      const job = await repos.jobs.get(binding.jobId);
      if (!job) throw new AppError('RESULT_INVALID', '任务不存在', 404);

      if (!this.issueCredentials) {
        throw new AppError(
          'STORAGE_AUTH_FAILED',
          '未配置存储凭据签发器',
          502,
        );
      }

      const prefix = options?.prefix ?? `jobs/${binding.jobId}/`;
      const creds = await this.issueCredentials({
        jobId: binding.jobId,
        prefix,
      });
      if (!creds) {
        throw new AppError('STORAGE_AUTH_FAILED', '无法签发存储凭据', 502);
      }
      return creds;
    });
  }
}

/** Test-only issuer — never pass as production default. */
export async function testOnlyCredentialIssuer(input: {
  jobId: number;
  prefix: string;
}): Promise<ShortLivedStorageCredentials> {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  return {
    driver: 's3',
    accessKeyId: `ASIATEST${input.jobId}`,
    secretAccessKey: 'temporary-secret',
    sessionToken: `session-${input.jobId}-${Date.now()}`,
    expiresAt,
    prefix: input.prefix,
    bucket: 'anime-media',
    region: 'auto',
  };
}
