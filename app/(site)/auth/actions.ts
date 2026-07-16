'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AppError, isAuthRequiredError } from '@/lib/server/shared/errors';
import {
  getFavoritesService,
  getListsService,
  getWatchProgressService,
} from '@/lib/server/identity';
import { getSystemSettingsService } from '@/lib/server/system';

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const xf = h.get('x-forwarded-for');
  if (xf) return xf.split(',')[0]?.trim() || null;
  return h.get('x-real-ip');
}

export async function actionPublicRegister(formData: FormData): Promise<void> {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const displayName = String(formData.get('displayName') || '').trim() || null;
  const next = String(formData.get('next') || '/favorites');
  const turnstileToken = String(formData.get('turnstileToken') || '');

  try {
    const result = await getSystemSettingsService().registerPublic({
      email,
      password,
      displayName,
      turnstileToken,
      remoteIp: await clientIp(),
    });
    if (result.needsVerification) {
      redirect('/login?ok=verify');
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    if (error instanceof AppError) {
      if (error.code === 'SOURCE_RATE_LIMITED') redirect('/register?error=rate');
      if (error.code === 'RESULT_CONFLICT') redirect('/register?error=exists');
      if (error.details?.field === 'email') redirect('/register?error=email');
      if (error.details?.field === 'password') redirect('/register?error=password');
      if (error.details?.field === 'whitelist') redirect('/register?error=whitelist');
      if (error.details?.field === 'registration') redirect('/register?error=closed');
      if (error.details?.field === 'turnstile') redirect('/register?error=turnstile');
    }
    redirect('/register?error=1');
  }

  redirect(safeNext(next, '/favorites'));
}

export async function actionPublicLogin(formData: FormData): Promise<void> {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/favorites');
  const turnstileToken = String(formData.get('turnstileToken') || '');

  try {
    const user = await getSystemSettingsService().loginPublic({
      emailOrUsername: email,
      password,
      turnstileToken,
      remoteIp: await clientIp(),
    });
    if (!user) {
      redirect('/login?error=1');
    }
    if (user.role === 'admin') {
      redirect('/admin');
    }
    redirect(safeNext(next, '/favorites'));
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    if (error instanceof AppError) {
      if (error.code === 'SOURCE_RATE_LIMITED') redirect('/login?error=rate');
      if (error.details?.field === 'verify') redirect('/login?error=verify');
      if (error.details?.field === 'turnstile') redirect('/login?error=turnstile');
    }
    redirect('/login?error=1');
  }
}

export async function actionPublicLogout(): Promise<void> {
  const { getIdentityService } = await import('@/lib/server/identity');
  await getIdentityService().logout();
  redirect('/');
}

export async function actionToggleFavorite(formData: FormData): Promise<void> {
  const animeId = parseInt(String(formData.get('animeId') || ''), 10);
  const returnTo = safeNext(String(formData.get('returnTo') || ''), `/watch/${animeId}`);

  try {
    await getFavoritesService().toggle(animeId);
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect(`/login?next=${encodeURIComponent(returnTo)}`);
    }
    redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}error=favorite`);
  }

  revalidatePath('/favorites');
  revalidatePath(`/watch/${animeId}`);
  redirect(returnTo);
}

export async function actionClearWatchProgress(formData: FormData): Promise<void> {
  const animeId = parseInt(String(formData.get('animeId') || ''), 10);
  try {
    await getWatchProgressService().deleteMine(animeId);
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect('/login?next=/history');
    }
    redirect('/history?error=1');
  }
  revalidatePath('/history');
  revalidatePath('/');
  redirect('/history');
}

export async function actionClearAllWatchProgress(): Promise<void> {
  try {
    await getWatchProgressService().deleteAllMine();
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect('/login?next=/history');
    }
    redirect('/history?error=1');
  }
  revalidatePath('/history');
  revalidatePath('/');
  redirect('/history');
}

export async function actionRequestPasswordReset(formData: FormData): Promise<void> {
  const email = String(formData.get('email') || '');
  try {
    await getSystemSettingsService().requestPasswordReset(email, await clientIp());
    redirect('/forgot-password?ok=1');
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    if (error instanceof AppError && error.code === 'CONFIG_INVALID') {
      redirect('/forgot-password?error=smtp');
    }
    if (error instanceof AppError && error.code === 'SOURCE_RATE_LIMITED') {
      redirect('/forgot-password?error=rate');
    }
    redirect('/forgot-password?error=1');
  }
}

export async function actionResetPassword(formData: FormData): Promise<void> {
  const token = String(formData.get('token') || '');
  const password = String(formData.get('password') || '');
  const passwordConfirm = String(formData.get('passwordConfirm') || '');
  if (password.length < 8 || password !== passwordConfirm) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=password`);
  }
  try {
    await getSystemSettingsService().resetPasswordWithToken(token, password);
    redirect('/reset-password?ok=1');
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    if (error instanceof AppError) {
      redirect(`/reset-password?token=${encodeURIComponent(token)}&error=token`);
    }
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=1`);
  }
}

function listRedirect(listId?: number): string {
  return listId && Number.isFinite(listId) && listId > 0
    ? `/favorites?list=${listId}`
    : '/favorites';
}

export async function actionCreateList(formData: FormData): Promise<void> {
  const name = String(formData.get('name') || '');
  try {
    const list = await getListsService().createCustom(name);
    revalidatePath('/favorites');
    redirect(listRedirect(list.id));
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    if (isAuthRequiredError(error)) {
      redirect('/login?next=/favorites');
    }
    redirect('/favorites?error=list');
  }
}

export async function actionDeleteList(formData: FormData): Promise<void> {
  const listId = parseInt(String(formData.get('listId') || ''), 10);
  try {
    await getListsService().deleteCustom(listId);
    revalidatePath('/favorites');
    redirect('/favorites');
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    if (isAuthRequiredError(error)) {
      redirect('/login?next=/favorites');
    }
    redirect(`/favorites?list=${listId}&error=list`);
  }
}

export async function actionAddToList(formData: FormData): Promise<void> {
  const listId = parseInt(String(formData.get('listId') || ''), 10);
  const animeId = parseInt(String(formData.get('animeId') || ''), 10);
  const returnTo = safeNext(
    String(formData.get('returnTo') || ''),
    listRedirect(listId),
  );
  try {
    await getListsService().addItem(listId, animeId);
    revalidatePath('/favorites');
    revalidatePath(`/watch/${animeId}`);
    redirect(returnTo);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    if (isAuthRequiredError(error)) {
      redirect(`/login?next=${encodeURIComponent(returnTo)}`);
    }
    redirect(returnTo);
  }
}

export async function actionRemoveFromList(formData: FormData): Promise<void> {
  const listId = parseInt(String(formData.get('listId') || ''), 10);
  const animeId = parseInt(String(formData.get('animeId') || ''), 10);
  try {
    await getListsService().removeItem(listId, animeId);
    revalidatePath('/favorites');
    redirect(listRedirect(listId));
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    if (isAuthRequiredError(error)) {
      redirect('/login?next=/favorites');
    }
    redirect(`${listRedirect(listId)}?error=1`);
  }
}

export async function actionSetListItemNote(formData: FormData): Promise<void> {
  const listId = parseInt(String(formData.get('listId') || ''), 10);
  const animeId = parseInt(String(formData.get('animeId') || ''), 10);
  const note = String(formData.get('note') || '');
  try {
    await getListsService().setNote(listId, animeId, note);
    revalidatePath('/favorites');
    redirect(listRedirect(listId));
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    redirect(`${listRedirect(listId)}?error=1`);
  }
}

function safeNext(candidate: string, fallback: string): string {
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  if (candidate.startsWith('/admin')) return fallback;
  return candidate;
}
