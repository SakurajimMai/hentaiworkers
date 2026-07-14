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

export async function adminCreateProfile(
  ctx: AdminActionContext,
  input: { name: string; configJson: string },
) {
  await requireAdmin(ctx);
  let config: unknown;
  try {
    config = JSON.parse(input.configJson);
  } catch {
    throw new AppError('RESULT_INVALID', '配置 JSON 无效', 400);
  }
  return ctx.crawler.createProfile(input.name, config);
}

export async function adminStartManualJob(
  ctx: AdminActionContext,
  input: {
    profileId: number;
    profileVersionId: number;
    configSnapshotJson: string;
    kind?: 'crawl' | 'storage_test' | 'cleanup';
  },
) {
  await requireAdmin(ctx);
  return ctx.crawler.startManualJob(input);
}

export async function adminSaveSchedule(
  ctx: AdminActionContext,
  input: Parameters<AdminCrawlerService['saveSchedule']>[0],
) {
  await requireAdmin(ctx);
  return ctx.crawler.saveSchedule(input);
}

export async function adminCancelJob(ctx: AdminActionContext, jobId: number) {
  await requireAdmin(ctx);
  return ctx.crawler.cancelJob(jobId);
}

export async function adminRetryJob(ctx: AdminActionContext, jobId: number) {
  await requireAdmin(ctx);
  return ctx.crawler.retryJob(jobId);
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
  let config: unknown;
  try {
    config = JSON.parse(input.configJson);
  } catch {
    throw new AppError('RESULT_INVALID', '存储配置 JSON 无效', 400);
  }
  return ctx.crawler.createStorageDraft(input.name, config);
}

export async function adminStartStorageTest(
  ctx: AdminActionContext,
  input: {
    profileId: number;
    storageProfileVersionId: number;
    configSnapshotJson: string;
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
