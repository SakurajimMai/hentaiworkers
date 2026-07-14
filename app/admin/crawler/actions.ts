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
  adminCreateSecret,
  adminCreateStorageDraft,
  adminMarkStorageTestPassed,
  adminRetryJob,
  adminSaveSchedule,
  adminStartManualJob,
  adminStartStorageTest,
  type AdminActionContext,
} from '@/lib/server/crawler/interfaces/admin-crawler-actions';
import { AppError } from '@/lib/server/shared/errors';
import { profileConfigFromForm, storageConfigFromForm } from './form-config';

function ctx(): AdminActionContext {
  return {
    identity: getIdentityService(),
    crawler: getAdminCrawlerService(),
  };
}

function revalidateCrawler() {
  revalidatePath('/admin/crawler');
  revalidatePath('/admin/crawler/jobs');
  revalidatePath('/admin/crawler/profiles');
  revalidatePath('/admin/crawler/schedules');
  revalidatePath('/admin/crawler/storage');
  revalidatePath('/admin/crawler/secrets');
  revalidatePath('/admin/crawler/import');
}

export async function actionCreateProfile(formData: FormData): Promise<void> {
  try {
    const configJson = formData.get('configJson')
      ? String(formData.get('configJson'))
      : profileConfigFromForm(formData);
    await adminCreateProfile(ctx(), {
      name: String(formData.get('name') || ''),
      configJson,
    });
    revalidateCrawler();
    redirect('/admin/crawler/profiles?ok=1');
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/profiles?error=1');
    throw error;
  }
}

export async function actionStartManualJob(formData: FormData): Promise<void> {
  try {
    const job = await adminStartManualJob(ctx(), {
      profileId: parseInt(String(formData.get('profileId') || '0'), 10),
      profileVersionId: parseInt(String(formData.get('profileVersionId') || '0'), 10),
      configSnapshotJson: String(formData.get('configSnapshotJson') || '{}'),
      kind: (String(formData.get('kind') || 'crawl') as 'crawl' | 'storage_test' | 'cleanup'),
    });
    revalidateCrawler();
    redirect(`/admin/crawler/jobs/${job.id}`);
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/jobs?error=1');
    throw error;
  }
}

export async function actionSaveSchedule(formData: FormData): Promise<void> {
  try {
    await adminSaveSchedule(ctx(), {
      profileId: parseInt(String(formData.get('profileId') || '0'), 10),
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
      configSnapshotJson: String(formData.get('configSnapshotJson') || '{}'),
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
    const id = parseInt(String(formData.get('jobId') || ''), 10);
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
    const id = parseInt(String(formData.get('jobId') || ''), 10);
    const job = await adminRetryJob(ctx(), id);
    revalidateCrawler();
    redirect(`/admin/crawler/jobs/${job.id}`);
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/jobs?error=retry');
    throw error;
  }
}

export async function actionCreateSecret(formData: FormData): Promise<void> {
  try {
    await adminCreateSecret(ctx(), {
      name: String(formData.get('name') || ''),
      scope: String(formData.get('scope') || ''),
      plaintext: String(formData.get('plaintext') || ''),
    });
    revalidateCrawler();
    redirect('/admin/crawler/secrets?ok=1');
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/secrets?error=1');
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

export async function actionCreateStorage(formData: FormData): Promise<void> {
  try {
    const configJson = formData.get('configJson')
      ? String(formData.get('configJson'))
      : storageConfigFromForm(formData);
    await adminCreateStorageDraft(ctx(), {
      name: String(formData.get('name') || ''),
      configJson,
    });
    revalidateCrawler();
    redirect('/admin/crawler/storage?ok=1');
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/storage?error=1');
    throw error;
  }
}

export async function actionStartStorageTest(formData: FormData): Promise<void> {
  try {
    const job = await adminStartStorageTest(ctx(), {
      profileId: parseInt(String(formData.get('profileId') || '0'), 10),
      storageProfileVersionId: parseInt(String(formData.get('storageProfileVersionId') || '0'), 10),
      configSnapshotJson: String(formData.get('configSnapshotJson') || '{}'),
    });
    revalidateCrawler();
    redirect(`/admin/crawler/jobs/${job.id}`);
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/storage?error=test');
    throw error;
  }
}

export async function actionMarkStorageTestPassed(formData: FormData): Promise<void> {
  try {
    const versionId = parseInt(String(formData.get('versionId') || ''), 10);
    const allowBreakGlass = formData.get('allowBreakGlass') === '1';
    await adminMarkStorageTestPassed(ctx(), versionId, { allowBreakGlass });
    revalidateCrawler();
    redirect('/admin/crawler/storage?ok=tested');
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/storage?error=1');
    throw error;
  }
}

export async function actionActivateStorage(formData: FormData): Promise<void> {
  try {
    const versionId = parseInt(String(formData.get('versionId') || ''), 10);
    await adminActivateStorage(ctx(), versionId);
    revalidateCrawler();
    redirect('/admin/crawler/storage?ok=active');
  } catch (error) {
    if (error instanceof AppError) redirect('/admin/crawler/storage?error=activate');
    throw error;
  }
}
