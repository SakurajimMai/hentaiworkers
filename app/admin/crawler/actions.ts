'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getIdentityService } from '@/lib/server/identity';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import {
  adminActivateStorage,
  adminCancelJob,
  adminConfirmYamlImport,
  adminCreateProfile,
  adminCreateStorageDraft,
  adminDeleteProfile,
  adminDeleteJob,
  adminMarkStorageTestPassed,
  adminProvisionWorker,
  adminPurgeTerminalJobs,
  adminRevokeWorkerCredential,
  adminRetryJob,
  adminSaveSchedule,
  adminStartProfileJob,
  adminStartStorageTest,
  adminUpdateProfile,
  type AdminActionContext,
} from '@/lib/server/crawler/interfaces/admin-crawler-actions';
import { AppError } from '@/lib/server/shared/errors';
import { profileConfigFromForm } from './form-config';

function ctx(): AdminActionContext {
  return {
    identity: getIdentityService(),
    crawler: getAdminCrawlerService(),
  };
}

export type WorkerProvisionState = Readonly<{
  token?: string;
  workerId?: number;
  credentialId?: number;
  error?: string;
}>;

export type ProfileActionState = Readonly<{
  error?: string;
}>;

function profileActionError(error: unknown): ProfileActionState | null {
  if (error instanceof AppError) return { error: error.message };
  if (error instanceof Error && error.name === 'ZodError') {
    return { error: '配置无效，请检查必填项和数值范围' };
  }
  return null;
}

function parsePositiveJobId(formData: FormData): number {
  const raw = String(formData.get('jobId') ?? '').trim();
  if (!/^\d+$/.test(raw)) throw new AppError('RESULT_INVALID', '无效任务 ID', 400);
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError('RESULT_INVALID', '无效任务 ID', 400);
  }
  return id;
}

function parsePositiveProfileId(formData: FormData): number {
  const raw = String(formData.get('profileId') ?? '').trim();
  if (!/^\d+$/.test(raw)) throw new AppError('RESULT_INVALID', '无效模板 ID', 400);
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError('RESULT_INVALID', '无效模板 ID', 400);
  }
  return id;
}

export async function actionProvisionWorker(
  _previous: WorkerProvisionState,
  formData: FormData,
): Promise<WorkerProvisionState> {
  try {
    const result = await adminProvisionWorker(
      ctx(),
      String(formData.get('name') || ''),
    );
    revalidatePath('/admin/crawler/workers');
    return {
      token: result.token,
      workerId: result.worker.id,
      credentialId: result.credentialId,
    };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    return { error: '创建 Worker 失败' };
  }
}

export async function actionRevokeWorkerCredential(formData: FormData): Promise<void> {
  try {
    await adminRevokeWorkerCredential(
      ctx(),
      parseInt(String(formData.get('credentialId') || ''), 10),
    );
    revalidatePath('/admin/crawler/workers');
    redirect('/admin/crawler/workers?ok=revoked');
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/workers?error=revoke');
    throw error;
  }
}

function revalidateCrawler() {
  revalidatePath('/admin/crawler');
  revalidatePath('/admin/crawler/jobs');
  revalidatePath('/admin/crawler/profiles');
  revalidatePath('/admin/crawler/schedules');
  revalidatePath('/admin/crawler/workers');
  revalidatePath('/admin/crawler/import');
}

export async function actionCreateProfile(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    const configJson = formData.get('configJson')
      ? String(formData.get('configJson'))
      : profileConfigFromForm(formData);
    await adminCreateProfile(ctx(), {
      name: String(formData.get('name') || ''),
      configJson,
    });
  } catch (error) {
    const state = profileActionError(error);
    if (state) return state;
    throw error;
  }
  revalidateCrawler();
  redirect('/admin/crawler/profiles?ok=1');
}

export async function actionUpdateProfile(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  try {
    const profileId = parsePositiveProfileId(formData);
    const actionContext = ctx();
    await actionContext.identity.requireAdmin();
    const profile = await actionContext.crawler.getProfile(profileId);
    if (!profile?.isEnabled || !profile.currentVersionId) {
      throw new AppError('RESULT_INVALID', '模板不存在或已删除', 404);
    }
    const currentVersion = await actionContext.crawler.getProfileVersion(
      profile.currentVersionId,
    );
    if (!currentVersion) {
      throw new AppError('RESULT_INVALID', '模板版本不存在', 404);
    }
    await adminUpdateProfile(actionContext, {
      profileId,
      name: String(formData.get('name') || ''),
      configJson: profileConfigFromForm(formData, currentVersion.config),
    });
  } catch (error) {
    const state = profileActionError(error);
    if (state) return state;
    throw error;
  }
  revalidateCrawler();
  redirect('/admin/crawler/profiles?ok=updated');
}

export async function actionDeleteProfile(formData: FormData): Promise<void> {
  try {
    await adminDeleteProfile(ctx(), parsePositiveProfileId(formData));
    revalidateCrawler();
    redirect('/admin/crawler/profiles?ok=deleted');
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/profiles?error=delete');
    throw error;
  }
}

export async function actionStartManualJob(formData: FormData): Promise<void> {
  try {
    const profileVersionId = parseInt(
      String(formData.get('profileVersionId') || '0'),
      10,
    );
    const job = await adminStartProfileJob(ctx(), profileVersionId);
    revalidateCrawler();
    redirect(`/admin/crawler/jobs/${job.id}`);
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/jobs?error=profile');
    throw error;
  }
}

export async function actionSaveSchedule(formData: FormData): Promise<void> {
  try {
    await adminSaveSchedule(ctx(), {
      profileVersionId: parseInt(String(formData.get('profileVersionId') || '0'), 10),
      name: String(formData.get('name') || ''),
      kind: String(formData.get('kind') || 'interval') as 'manual' | 'interval' | 'daily' | 'weekly' | 'cron',
      cron: String(formData.get('cron') || '') || undefined,
      intervalSeconds: formData.get('intervalSeconds')
        ? parseInt(String(formData.get('intervalSeconds')), 10)
        : undefined,
      timezone: String(formData.get('timezone') || 'UTC'),
      overlapPolicy: String(formData.get('overlapPolicy') || 'skip') as 'skip' | 'queue' | 'parallel',
      misfirePolicy: String(formData.get('misfirePolicy') || 'latest_only') as
        | 'skip'
        | 'latest_only'
        | 'catch_up',
      maxActiveJobs: parseInt(String(formData.get('maxActiveJobs') || '1'), 10),
      catchUpLimit: parseInt(String(formData.get('catchUpLimit') || '3'), 10),
      nextRunAt: String(formData.get('nextRunAt') || '') || undefined,
    });
    revalidateCrawler();
    redirect('/admin/crawler/schedules?ok=1');
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/schedules?error=1');
    throw error;
  }
}

export async function actionCancelJob(formData: FormData): Promise<void> {
  try {
    const id = parsePositiveJobId(formData);
    await adminCancelJob(ctx(), id);
    revalidateCrawler();
    redirect(`/admin/crawler/jobs/${id}`);
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/jobs?error=cancel');
    throw error;
  }
}

export async function actionRetryJob(formData: FormData): Promise<void> {
  try {
    const id = parsePositiveJobId(formData);
    const job = await adminRetryJob(ctx(), id);
    revalidateCrawler();
    redirect(`/admin/crawler/jobs/${job.id}`);
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/jobs?error=retry');
    throw error;
  }
}

export async function actionDeleteJob(formData: FormData): Promise<void> {
  try {
    const id = parsePositiveJobId(formData);
    await adminDeleteJob(ctx(), id);
    revalidateCrawler();
    redirect('/admin/crawler/jobs?ok=deleted');
  } catch (error) {
    if (error instanceof AppError) {
      const code = error.code === 'RESULT_CONFLICT' ? 'delete_active' : 'delete';
      redirect(`/admin/crawler/jobs?error=${code}`);
    }
    throw error;
  }
}

export async function actionPurgeJobs(formData: FormData): Promise<void> {
  try {
    const olderThanDays = parseInt(String(formData.get('olderThanDays') || ''), 10);
    const scope = String(formData.get('scope') || 'all');
    const result = await adminPurgeTerminalJobs(ctx(), { olderThanDays, scope });
    revalidateCrawler();
    redirect(
      `/admin/crawler/jobs?ok=purged&n=${result.deleted}&truncated=${result.truncated ? '1' : '0'}`,
    );
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/jobs?error=purge');
    throw error;
  }
}

export async function actionConfirmYamlImport(formData: FormData): Promise<void> {
  try {
    await adminConfirmYamlImport(ctx(), {
      name: String(formData.get('name') || 'imported'),
      rawYaml: String(formData.get('rawYaml') || ''),
    });
    revalidateCrawler();
    redirect('/admin/crawler/profiles?ok=import');
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/import?error=1');
    throw error;
  }
}

function storageConfigFromForm(formData: FormData): unknown {
  const driver = String(formData.get('driver') || '').trim();
  if (driver === 's3') {
    return {
      driver: 's3',
      endpoint: String(formData.get('endpoint') || '').trim(),
      region: String(formData.get('region') || '').trim() || 'auto',
      bucket: String(formData.get('bucket') || '').trim(),
      prefix: String(formData.get('prefix') || '').trim(),
      deliveryMode: String(formData.get('deliveryMode') || 'public'),
      publicBaseUrl: String(formData.get('publicBaseUrl') || '').trim() || undefined,
      forcePathStyle: formData.get('forcePathStyle') === '1',
      organizeByDate: formData.get('organizeByDate') === '1',
    };
  }
  if (driver === 'sftp') {
    return {
      driver: 'sftp',
      host: String(formData.get('host') || '').trim(),
      port: parseInt(String(formData.get('port') || '22'), 10) || 22,
      username: String(formData.get('username') || '').trim(),
      rootPath: String(formData.get('rootPath') || '').trim(),
      hostKeyFingerprint: String(formData.get('hostKeyFingerprint') || '').trim(),
      publicBaseUrl: String(formData.get('publicBaseUrl') || '').trim() || undefined,
      organizeByDate: formData.get('organizeByDate') === '1',
    };
  }
  throw new AppError('RESULT_INVALID', 'driver 须为 s3 或 sftp', 400);
}

export async function actionCreateStorageDraft(formData: FormData): Promise<void> {
  try {
    const name = String(formData.get('name') || '').trim();
    const config = storageConfigFromForm(formData);
    await adminCreateStorageDraft(ctx(), {
      name,
      configJson: JSON.stringify(config),
    });
    revalidateCrawler();
    redirect('/admin/crawler/storage?ok=1');
  } catch (error) {
    if (error instanceof AppError) {
      redirect(`/admin/crawler/storage?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}

export async function actionStartStorageTest(formData: FormData): Promise<void> {
  try {
    const storageProfileVersionId = parseInt(
      String(formData.get('storageProfileVersionId') || ''),
      10,
    );
    await adminStartStorageTest(ctx(), {
      storageProfileVersionId,
    });
    revalidateCrawler();
    redirect('/admin/crawler/storage?ok=job');
  } catch (error) {
    if (error instanceof AppError) {
      redirect(`/admin/crawler/storage?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}

export async function actionMarkStorageTestPassed(formData: FormData): Promise<void> {
  try {
    const versionId = parseInt(String(formData.get('versionId') || ''), 10);
    // Admin break-glass for environments without a full storage_test worker path yet.
    await adminMarkStorageTestPassed(ctx(), versionId, { allowBreakGlass: true });
    revalidateCrawler();
    redirect('/admin/crawler/storage?ok=tested');
  } catch (error) {
    if (error instanceof AppError) {
      redirect(`/admin/crawler/storage?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}

export async function actionActivateStorage(formData: FormData): Promise<void> {
  try {
    const versionId = parseInt(String(formData.get('versionId') || ''), 10);
    await adminActivateStorage(ctx(), versionId);
    revalidateCrawler();
    redirect('/admin/crawler/storage?ok=activated');
  } catch (error) {
    if (error instanceof AppError) {
      redirect(`/admin/crawler/storage?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}
