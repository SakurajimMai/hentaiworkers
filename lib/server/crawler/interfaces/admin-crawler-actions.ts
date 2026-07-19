import { AppError } from '../../shared/errors';
import type { AdminCrawlerService } from '../application/admin-crawler-service';
import type { IdentityService } from '../../identity/application/identity-service';

export type AdminActionContext = Readonly<{
  identity: Pick<IdentityService, 'requireAdmin'>;
  crawler: AdminCrawlerService;
}>;

async function requireAdmin(ctx: AdminActionContext) {
  return ctx.identity.requireAdmin();
}

function parseJson(raw: string, message = '配置 JSON 无效'): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError('RESULT_INVALID', message, 400);
  }
}

export async function adminProvisionWorker(
  ctx: AdminActionContext,
  name: string,
) {
  await requireAdmin(ctx);
  return ctx.crawler.provisionWorker(name);
}

export async function adminRevokeWorkerCredential(
  ctx: AdminActionContext,
  credentialId: number,
) {
  await requireAdmin(ctx);
  return ctx.crawler.revokeWorkerCredential(credentialId);
}

export async function adminCreateProfile(
  ctx: AdminActionContext,
  input: { name: string; configJson: string },
) {
  await requireAdmin(ctx);
  return ctx.crawler.createProfile(input.name, parseJson(input.configJson));
}

export async function adminUpdateProfile(
  ctx: AdminActionContext,
  input: { profileId: number; name: string; configJson: string },
) {
  await requireAdmin(ctx);
  return ctx.crawler.updateProfile(
    input.profileId,
    input.name,
    parseJson(input.configJson),
  );
}

export async function adminDeleteProfile(
  ctx: AdminActionContext,
  profileId: number,
) {
  await requireAdmin(ctx);
  return ctx.crawler.deleteProfile(profileId);
}

export async function adminStartManualJob(
  ctx: AdminActionContext,
  input: { profileVersionId: number },
) {
  await requireAdmin(ctx);
  return ctx.crawler.startManualJob(input);
}

export async function adminStartProfileJob(
  ctx: AdminActionContext,
  profileVersionId: number,
) {
  await requireAdmin(ctx);
  return ctx.crawler.startProfileJob(profileVersionId);
}

export async function adminSaveSchedule(
  ctx: AdminActionContext,
  input: Parameters<AdminCrawlerService['saveSchedule']>[0],
) {
  await requireAdmin(ctx);
  return ctx.crawler.saveSchedule(input);
}

function requirePositiveJobId(jobId: number): void {
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new AppError('RESULT_INVALID', '无效任务 ID', 400);
  }
}

export async function adminCancelJob(ctx: AdminActionContext, jobId: number) {
  await requireAdmin(ctx);
  requirePositiveJobId(jobId);
  return ctx.crawler.cancelJob(jobId);
}

export async function adminRetryJob(ctx: AdminActionContext, jobId: number) {
  await requireAdmin(ctx);
  requirePositiveJobId(jobId);
  return ctx.crawler.retryJob(jobId);
}

export async function adminDeleteJob(ctx: AdminActionContext, jobId: number) {
  await requireAdmin(ctx);
  requirePositiveJobId(jobId);
  return ctx.crawler.deleteJob(jobId);
}

export async function adminPurgeTerminalJobs(
  ctx: AdminActionContext,
  input: {
    olderThanDays: number;
    /** success | failed | cancelled | all */
    scope?: string;
  },
) {
  await requireAdmin(ctx);
  const scope = (input.scope || 'all').trim().toLowerCase();
  const statusByScope: Readonly<Record<
    string,
    readonly import('../domain/job').CrawlerJobStatus[]
  >> = {
    all: ['succeeded', 'partial_succeeded', 'failed', 'cancelled'],
    success: ['succeeded', 'partial_succeeded'],
    failed: ['failed'],
    cancelled: ['cancelled'],
  };
  const statuses = statusByScope[scope];
  if (!statuses) {
    throw new AppError('RESULT_INVALID', '无效清理范围', 400, false, { scope });
  }
  return ctx.crawler.purgeTerminalJobs({ olderThanDays: input.olderThanDays, statuses });
}

export async function adminRevealSecret(ctx: AdminActionContext, secretId: number) {
  await requireAdmin(ctx);
  return ctx.crawler.revealSecret(secretId);
}

export async function adminCreateSecret(
  ctx: AdminActionContext,
  input: { name: string; scope: string; plaintext: string },
) {
  await requireAdmin(ctx);
  return ctx.crawler.createSecret(input.name, input.scope, input.plaintext);
}

export async function adminPreviewYaml(ctx: AdminActionContext, rawYaml: string) {
  await requireAdmin(ctx);
  return ctx.crawler.previewYaml(rawYaml);
}

export async function adminConfirmYamlImport(
  ctx: AdminActionContext,
  input: { name: string; rawYaml: string; nodeEnv?: string },
) {
  await requireAdmin(ctx);
  return ctx.crawler.confirmYamlImport(input);
}

export async function adminCreateStorageDraft(
  ctx: AdminActionContext,
  input: { name: string; configJson: string },
) {
  await requireAdmin(ctx);
  return ctx.crawler.createStorageDraft(
    input.name,
    parseJson(input.configJson, '存储配置 JSON 无效'),
  );
}

export async function adminStartStorageTest(
  ctx: AdminActionContext,
  input: {
    storageProfileVersionId: number;
  },
) {
  await requireAdmin(ctx);
  return ctx.crawler.startStorageTestJob(input);
}

export async function adminActivateStorage(
  ctx: AdminActionContext,
  versionId: number,
) {
  await requireAdmin(ctx);
  return ctx.crawler.activateStorage(versionId);
}

/**
 * Break-glass only: prefer Worker storage_test completion to set the flag.
 * Requires explicit allowBreakGlass to avoid turning the gate into a checkbox.
 */
export async function adminMarkStorageTestPassed(
  ctx: AdminActionContext,
  versionId: number,
  options?: { allowBreakGlass?: boolean },
) {
  await requireAdmin(ctx);
  if (!options?.allowBreakGlass) {
    throw new AppError(
      'RESULT_CONFLICT',
      'storage_test 通过标记仅能由成功的 storage_test 任务写入',
      409,
    );
  }
  return ctx.crawler.markStorageTestPassed(versionId);
}
