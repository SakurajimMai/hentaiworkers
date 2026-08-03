'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AppError, isAuthRequiredError } from '@/lib/server/shared/errors';
import { getIdentityService } from '@/lib/server/identity';
import { getAdminCatalogService } from '@/lib/server/catalog/admin';
import { parsePlayerSettingsFromForm } from '@/lib/server/system/domain/player-settings-form';

function mapAuthRedirect(error: unknown, fallback: string): never {
  if (error instanceof AppError) {
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    if (error.details?.field === 'current') redirect('/admin/account?error=current');
    if (error.details?.field === 'next' || error.message.includes('8')) {
      redirect('/admin/account?error=short');
    }
  }
  redirect(fallback);
}

export async function actionLogin(formData: FormData): Promise<void> {
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');
  try {
    const user = await getIdentityService().login(username, password);
    if (!user || user.role !== 'admin') {
      redirect('/admin/login?error=1');
    }
    redirect('/admin');
  } catch {
    redirect('/admin/login?error=1');
  }
}

export async function actionLogout(): Promise<void> {
  await getIdentityService().logout();
  redirect('/admin/login');
}

export async function actionChangePassword(formData: FormData): Promise<void> {
  try {
    const admin = await getIdentityService().requireAdmin();
    const current = String(formData.get('current') || '');
    const next = String(formData.get('next') || '');
    await getIdentityService().changePassword(admin.id, current, next);
    redirect('/admin/account?ok=1');
  } catch (error) {
    mapAuthRedirect(error, '/admin/account?error=1');
  }
}

export async function actionSaveAnime(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const idRaw = formData.get('id');
    const id = idRaw ? parseInt(String(idRaw), 10) : null;
    const tagIds = formData
      .getAll('tagIds')
      .map((v) => parseInt(String(v), 10))
      .filter((n) => Number.isFinite(n));

    await getAdminCatalogService().saveAnime({
      id: id && Number.isFinite(id) ? id : null,
      title: String(formData.get('title') || ''),
      videoUrl: String(formData.get('videoUrl') || ''),
      titleEnglish: String(formData.get('titleEnglish') || '') || null,
      titleJapanese: String(formData.get('titleJapanese') || '') || null,
      description: String(formData.get('description') || '') || null,
      cover: String(formData.get('cover') || '') || null,
      fanart: String(formData.get('fanart') || '') || null,
      isActive: formData.get('isActive') === '1' ? 1 : 0,
      tagIds,
    });

    revalidatePath('/admin/animes');
    revalidatePath('/');
    redirect('/admin/animes');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect('/admin/animes?error=required');
    }
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    throw error;
  }
}

export async function actionDeleteAnime(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const id = parseInt(String(formData.get('id') || ''), 10);
    await getAdminCatalogService().deleteAnime(id);
    revalidatePath('/admin/animes');
    revalidatePath('/');
    redirect('/admin/animes');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect('/admin/animes?error=id');
    }
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    throw error;
  }
}

export async function actionToggleAnime(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const id = parseInt(String(formData.get('id') || ''), 10);
    const isActive = formData.get('isActive') === '1' ? 0 : 1;
    await getAdminCatalogService().setAnimeActive(id, isActive);
    revalidatePath('/admin/animes');
    revalidatePath('/');
    redirect('/admin/animes');
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    throw error;
  }
}

export async function actionBatchAnimes(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const ids = [...new Set(
      formData
        .getAll('ids')
        .map((value) => Number.parseInt(String(value), 10))
        .filter((id) => Number.isInteger(id) && id > 0),
    )].slice(0, 100);

    if (ids.length === 0) redirect('/admin/animes?error=batch_empty');

    const operation = String(formData.get('op') || '');
    const service = getAdminCatalogService();
    if (operation === 'activate' || operation === 'deactivate') {
      const isActive = operation === 'activate' ? 1 : 0;
      for (const id of ids) await service.setAnimeActive(id, isActive);
    } else if (operation === 'delete') {
      for (const id of ids) await service.deleteAnime(id);
    } else {
      redirect('/admin/animes?error=batch_invalid');
    }

    revalidatePath('/admin/animes');
    revalidatePath('/');
    redirect(`/admin/animes?ok=batch_${operation}&n=${ids.length}`);
  } catch (error) {
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

export async function actionSaveTag(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const idRaw = formData.get('id');
    await getAdminCatalogService().saveTag({
      id: idRaw ? parseInt(String(idRaw), 10) : null,
      name: String(formData.get('name') || ''),
      description: String(formData.get('description') || '') || null,
    });
    revalidatePath('/admin/tags');
    redirect('/admin/tags');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect('/admin/tags?error=name');
    }
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    throw error;
  }
}

export async function actionDeleteTag(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const id = parseInt(String(formData.get('id') || ''), 10);
    await getAdminCatalogService().deleteTag(id);
    revalidatePath('/admin/tags');
    redirect('/admin/tags');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_CONFLICT') {
      const count = Number(error.details?.count ?? 0);
      redirect(`/admin/tags?error=linked&count=${count}`);
    }
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    throw error;
  }
}

export async function actionSaveUser(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const idRaw = formData.get('id');
    const username = String(formData.get('username') || '').trim();
    const role = String(formData.get('role') || 'user') === 'admin' ? 'admin' : 'user';
    const isActive = formData.get('isActive') === '1' ? 1 : 0;
    const password = String(formData.get('password') || '');
    const displayName = String(formData.get('displayName') || '') || null;

    if (idRaw) {
      const id = parseInt(String(idRaw), 10);
      await getIdentityService().updateUser(id, {
        role,
        isActive,
        displayName,
        password: password || undefined,
      });
    } else {
      await getIdentityService().createUser({
        username,
        password,
        role,
        isActive,
        displayName,
      });
    }
    revalidatePath('/admin/users');
    redirect('/admin/users');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect('/admin/users?error=required');
    }
    if (error instanceof AppError && error.code === 'RESULT_CONFLICT') {
      redirect('/admin/users?error=exists');
    }
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    throw error;
  }
}

export async function actionImportJson(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const raw = String(formData.get('payload') || '');
    let items: unknown;
    try {
      items = JSON.parse(raw);
      if (!Array.isArray(items)) throw new Error('root must be array');
    } catch {
      redirect('/admin/import?error=json');
    }

    const result = await getAdminCatalogService().importBatch(
      items as Array<Record<string, unknown>>,
    );
    revalidatePath('/admin/animes');
    revalidatePath('/');
    redirect(
      `/admin/import?ok=1&created=${result.created}&updated=${result.updated}&skipped=${result.skipped}&errors=${result.errors.length}`,
    );
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    throw error;
  }
}

export async function searchAnimesAdmin(q: string, page: number) {
  await getIdentityService().requireAdmin();
  return getAdminCatalogService().searchAnimes(q, page);
}

export async function getSessionInfo() {
  return getIdentityService().getSessionInfo();
}

export async function actionSaveSystemSettings(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const { getSystemSettingsService } = await import('@/lib/server/system');
    const whitelistRaw = String(formData.get('emailWhitelist') || '');
    const emailWhitelist = whitelistRaw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    await getSystemSettingsService().update({
      registration: {
        open: formData.get('registrationOpen') === '1',
        requireEmailVerification: formData.get('requireEmailVerification') === '1',
        emailWhitelist,
      },
      smtp: {
        enabled: formData.get('smtpEnabled') === '1',
        host: String(formData.get('smtpHost') || ''),
        port: parseInt(String(formData.get('smtpPort') || '587'), 10) || 587,
        secure: formData.get('smtpSecure') === '1',
        username: String(formData.get('smtpUsername') || ''),
        fromEmail: String(formData.get('smtpFromEmail') || ''),
        fromName: String(formData.get('smtpFromName') || 'AnimeStream'),
        password: String(formData.get('smtpPassword') || '') || undefined,
      },
      turnstile: {
        enabled: formData.get('turnstileEnabled') === '1',
        siteKey: String(formData.get('turnstileSiteKey') || ''),
        secretKey: String(formData.get('turnstileSecretKey') || '') || undefined,
      },
      trust: {
        turnstileOnRegister: formData.get('turnstileOnRegister') === '1',
        turnstileOnLogin: formData.get('turnstileOnLogin') === '1',
        verificationTokenTtlMinutes:
          parseInt(String(formData.get('verificationTokenTtlMinutes') || '60'), 10) || 60,
      },
      player: parsePlayerSettingsFromForm(formData),
    });
    revalidatePath('/admin/settings');
    revalidatePath('/login');
    revalidatePath('/register');
    revalidatePath('/watch');
    redirect('/admin/settings?ok=1');
  } catch (error) {
    if (error instanceof AppError) {
      if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
      if (error.message.includes('SMTP')) redirect('/admin/settings?error=verify_smtp');
    }
    // Next.js redirect throws; rethrow
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    redirect('/admin/settings?error=1');
  }
}

export async function actionSendSmtpTest(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const { getSystemSettingsService } = await import('@/lib/server/system');
    const to = String(formData.get('to') || '').trim();
    await getSystemSettingsService().sendTestEmail(to);
    redirect('/admin/settings?ok=smtp');
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    redirect('/admin/settings?error=smtp');
  }
}
