'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AppError, isAuthRequiredError } from '@/lib/server/shared/errors';
import {
  getFavoritesService,
  getWatchProgressService,
} from '@/lib/server/identity';
import { getSystemSettingsService } from '@/lib/server/system';
import { toggleMangaFavorite } from '@/lib/server/manga-favorites';

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
    // Admins land on the site like everyone else; the header user menu
    // exposes 管理中心. /admin stays reachable directly.
    redirect(safeNext(next, user.role === 'admin' ? '/' : '/favorites'));
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

export async function actionUpdateProfile(formData: FormData): Promise<void> {
  const { getIdentityService } = await import('@/lib/server/identity');
  const displayName = String(formData.get('displayName') || '').trim().slice(0, 64);
  try {
    const user = await getIdentityService().requireUser();
    await getIdentityService().updateUser(user.id, {
      displayName: displayName || null,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    if (isAuthRequiredError(error)) {
      redirect('/login?next=/account');
    }
    redirect('/account?error=profile');
  }
  revalidatePath('/account');
  redirect('/account?ok=profile');
}

export async function actionChangeMyPassword(formData: FormData): Promise<void> {
  const { getIdentityService } = await import('@/lib/server/identity');
  const current = String(formData.get('current') || '');
  const next = String(formData.get('next') || '');
  const confirm = String(formData.get('confirm') || '');
  if (next.length < 8 || next !== confirm) {
    redirect('/account?error=password');
  }
  try {
    const user = await getIdentityService().requireUser();
    // Destroys the session; the user signs in again with the new password.
    await getIdentityService().changePassword(user.id, current, next);
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    if (isAuthRequiredError(error)) {
      redirect('/login?next=/account');
    }
    if (error instanceof AppError && error.details?.field === 'current') {
      redirect('/account?error=current');
    }
    redirect('/account?error=password');
  }
  redirect('/login?ok=password');
}

export async function actionToggleFavoriteState(animeId: number, returnTo = `/watch/${animeId}`) {
  try {
    const result = await getFavoritesService().toggle(animeId);
    revalidatePath('/favorites');
    revalidatePath(`/watch/${animeId}`);
    return { ok: true as const, favorited: result.favorited };
  } catch (error) {
    if (isAuthRequiredError(error)) {
      return { ok: false as const, login: `/login?next=${encodeURIComponent(safeNext(returnTo, `/watch/${animeId}`))}` };
    }
    return { ok: false as const };
  }
}

export async function actionToggleMangaFavoriteState(mangaId: number, returnTo = `/manga/${mangaId}`) {
  try {
    const result = await toggleMangaFavorite(mangaId);
    revalidatePath('/favorites');
    revalidatePath(`/manga/${mangaId}`);
    return { ok: true as const, favorited: result.favorited };
  } catch (error) {
    if (isAuthRequiredError(error)) {
      return { ok: false as const, login: `/login?next=${encodeURIComponent(safeNext(returnTo, `/manga/${mangaId}`))}` };
    }
    return { ok: false as const };
  }
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

function safeNext(candidate: string, fallback: string): string {
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  if (candidate.startsWith('/admin')) return fallback;
  return candidate;
}
