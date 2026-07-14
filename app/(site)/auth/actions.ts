'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AppError } from '@/lib/server/shared/errors';
import { getFavoritesService, getIdentityService } from '@/lib/server/identity';

export async function actionPublicRegister(formData: FormData): Promise<void> {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const displayName = String(formData.get('displayName') || '').trim() || null;
  const next = String(formData.get('next') || '/favorites');

  try {
    await getIdentityService().registerWithEmail({ email, password, displayName });
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'RESULT_CONFLICT') redirect('/register?error=exists');
      if (error.details?.field === 'email') redirect('/register?error=email');
      if (error.details?.field === 'password') redirect('/register?error=password');
    }
    redirect('/register?error=1');
  }

  redirect(safeNext(next, '/favorites'));
}

export async function actionPublicLogin(formData: FormData): Promise<void> {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/favorites');

  const user = await getIdentityService().loginPublic(email, password);
  if (!user) {
    redirect('/login?error=1');
  }

  // Admins logging in on public form go to admin home
  if (user.role === 'admin') {
    redirect('/admin');
  }
  redirect(safeNext(next, '/favorites'));
}

export async function actionPublicLogout(): Promise<void> {
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
