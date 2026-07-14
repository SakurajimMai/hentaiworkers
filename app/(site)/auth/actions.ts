'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AppError } from '@/lib/server/shared/errors';
import { getFavoritesService } from '@/lib/server/identity';
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
  const returnTo = String(formData.get('returnTo') || '');

  try {
    await getFavoritesService().toggle(animeId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'WORKER_FORBIDDEN') {
      redirect(`/login?next=${encodeURIComponent(returnTo || `/watch/${animeId}`)}`);
    }
    redirect(returnTo || `/watch/${animeId}?error=favorite`);
  }

  revalidatePath('/favorites');
  revalidatePath(`/watch/${animeId}`);
  if (returnTo.startsWith('/')) {
    redirect(returnTo);
  }
  redirect(`/watch/${animeId}`);
}

export async function actionRemoveFavorite(formData: FormData): Promise<void> {
  const animeId = parseInt(String(formData.get('animeId') || ''), 10);
  try {
    await getFavoritesService().remove(animeId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'WORKER_FORBIDDEN') {
      redirect('/login?next=/favorites');
    }
    redirect('/favorites?error=1');
  }
  revalidatePath('/favorites');
  redirect('/favorites');
}

function safeNext(candidate: string, fallback: string): string {
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  if (candidate.startsWith('/admin')) return fallback;
  return candidate;
}
