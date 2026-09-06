'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { AppError, isAuthRequiredError } from '@/lib/server/shared/errors';
import { getIdentityService } from '@/lib/server/identity';
import { getAdminCatalogService } from '@/lib/server/catalog/admin';
import { parseAdsSettingsFromForm } from '@/lib/server/system/domain/ads-settings-form';
import { parsePlayerSettingsFromForm } from '@/lib/server/system/domain/player-settings-form';
import { parseHeroSettingsFromForm } from '@/lib/server/system/domain/hero-settings-form';
import { parseSiteMetaTagsFromForm } from '@/lib/server/system/domain/site-settings-form';
import { SITE_META_CACHE_TAG } from '@/lib/site-meta';
import {
  deleteAdminManga,
  deleteAdminMangaChapter,
  deleteAdminMangaPage,
  removeAdminMangaTag,
  renameAdminMangaTag,
  setAdminMangaChapterPublished,
  setAdminMangaPublished,
  updateAdminManga,
  updateAdminMangaPage,
  updateAdminMangaPages,
} from '@/lib/server/manga-admin';
import { normalizeMangaTagQuery, normalizeMangaTags } from '@/lib/manga-tags';

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
  const current = String(formData.get('current') || '');
  const next = String(formData.get('next') || '');
  const confirm = String(formData.get('confirm') || '');
  if (next.length < 8) {
    redirect('/admin/account?error=short');
  }
  if (next !== confirm) {
    redirect('/admin/account?error=mismatch');
  }
  try {
    const admin = await getIdentityService().requireAdmin();
    await getIdentityService().changePassword(admin.id, current, next);
    redirect('/admin/login?ok=password');
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
    revalidatePath('/browse');
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
    revalidatePath('/browse');
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
    revalidatePath('/browse');
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
    revalidatePath('/browse');
    redirect(`/admin/animes?ok=batch_${operation}&n=${ids.length}`);
  } catch (error) {
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

export async function actionSaveManga(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') || ''), 10);
  try {
    await getIdentityService().requireAdmin();
    await updateAdminManga({
      id,
      title: String(formData.get('title') || ''),
      slug: String(formData.get('slug') || ''),
      author: String(formData.get('author') || '') || null,
      tags: String(formData.get('tags') || '')
        .split(/[\n,，、|]+/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      description: String(formData.get('description') || '') || null,
      coverUrl: String(formData.get('coverUrl') || '') || null,
      sourceChatTitle: String(formData.get('sourceChatTitle') || '') || null,
      isPublished: formData.get('isPublished') === '1' ? 1 : 0,
    });
    revalidatePath('/admin/mangas');
    revalidatePath(`/admin/mangas/${id}`);
    revalidatePath('/manga');
    redirect(`/admin/mangas/${id}?ok=manga_updated`);
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect(`/admin/mangas/${id}?error=required`);
    }
    if (error instanceof AppError && error.code === 'RESULT_CONFLICT') {
      redirect(`/admin/mangas/${id}?error=slug`);
    }
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

export async function actionToggleManga(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') || ''), 10);
  try {
    await getIdentityService().requireAdmin();
    const isPublished = formData.get('isPublished') === '1' ? 0 : 1;
    await setAdminMangaPublished(id, isPublished);
    revalidatePath('/admin/mangas');
    revalidatePath(`/admin/mangas/${id}`);
    revalidatePath('/manga');
    redirect('/admin/mangas?ok=manga_updated');
  } catch (error) {
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

export async function actionDeleteManga(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') || ''), 10);
  try {
    await getIdentityService().requireAdmin();
    await deleteAdminManga(id);
    revalidatePath('/admin/mangas');
    revalidatePath('/manga');
    redirect('/admin/mangas?ok=deleted');
  } catch (error) {
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

function mangaAdminReturnTo(formData: FormData, mangaId: number, extra?: string) {
  const pages = String(formData.get('pages') || '').trim();
  const chapter = String(formData.get('chapter') || '').trim();
  const view = String(formData.get('view') || '').trim();
  const params = new URLSearchParams();
  if (pages && pages !== '1') params.set('pages', pages);
  if (chapter) params.set('chapter', chapter);
  if (view === 'links') params.set('view', 'links');
  if (extra) {
    const [key, value] = extra.split('=');
    if (key && value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/admin/mangas/${mangaId}?${query}` : `/admin/mangas/${mangaId}`;
}

export async function actionDeleteMangaChapter(formData: FormData): Promise<void> {
  const mangaId = parseInt(String(formData.get('mangaId') || ''), 10);
  const chapterId = parseInt(String(formData.get('chapterId') || ''), 10);
  try {
    await getIdentityService().requireAdmin();
    await deleteAdminMangaChapter(mangaId, chapterId);
    revalidatePath('/admin/mangas');
    revalidatePath(`/admin/mangas/${mangaId}`);
    revalidatePath('/manga');
    redirect(mangaAdminReturnTo(formData, mangaId, 'ok=chapter_deleted'));
  } catch (error) {
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

export async function actionDeleteMangaPage(formData: FormData): Promise<void> {
  const mangaId = parseInt(String(formData.get('mangaId') || ''), 10);
  const pageId = parseInt(String(formData.get('pageId') || ''), 10);
  try {
    await getIdentityService().requireAdmin();
    await deleteAdminMangaPage(mangaId, pageId);
    revalidatePath('/admin/mangas');
    revalidatePath(`/admin/mangas/${mangaId}`);
    revalidatePath('/manga');
    redirect(mangaAdminReturnTo(formData, mangaId, 'ok=page_deleted'));
  } catch (error) {
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

export async function actionSaveMangaPage(formData: FormData): Promise<void> {
  const mangaId = parseInt(String(formData.get('mangaId') || ''), 10);
  const pageId = parseInt(String(formData.get('pageId') || ''), 10);
  try {
    await getIdentityService().requireAdmin();
    await updateAdminMangaPage(mangaId, pageId, String(formData.get('imageUrl') || ''));
    revalidatePath(`/admin/mangas/${mangaId}`);
    revalidatePath('/manga');
    redirect(mangaAdminReturnTo(formData, mangaId, 'ok=page_updated'));
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect(mangaAdminReturnTo(formData, mangaId, 'error=page_url'));
    }
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

export async function actionSaveMangaPageUrls(formData: FormData): Promise<void> {
  const mangaId = parseInt(String(formData.get('mangaId') || ''), 10);
  const ids = formData
    .getAll('pageIds')
    .map((value) => parseInt(String(value), 10))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  const urls = String(formData.get('urls') || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  try {
    await getIdentityService().requireAdmin();
    if (ids.length !== urls.length) {
      redirect(mangaAdminReturnTo(formData, mangaId, 'error=page_count'));
    }
    await updateAdminMangaPages(
      mangaId,
      ids.map((id, index) => ({ id, imageUrl: urls[index] })),
    );
    revalidatePath(`/admin/mangas/${mangaId}`);
    revalidatePath('/manga');
    redirect(mangaAdminReturnTo(formData, mangaId, 'ok=pages_updated'));
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect(mangaAdminReturnTo(formData, mangaId, 'error=page_url'));
    }
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

export async function actionToggleMangaChapter(formData: FormData): Promise<void> {
  const mangaId = parseInt(String(formData.get('mangaId') || ''), 10);
  const chapterId = parseInt(String(formData.get('chapterId') || ''), 10);
  try {
    await getIdentityService().requireAdmin();
    const isPublished = formData.get('isPublished') === '1' ? 0 : 1;
    await setAdminMangaChapterPublished(mangaId, chapterId, isPublished);
    revalidatePath(`/admin/mangas/${mangaId}`);
    revalidatePath('/manga');
    redirect(mangaAdminReturnTo(formData, mangaId, 'ok=chapter_updated'));
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

async function updateCuratedMangaTags(
  mutate: (current: string[]) => string[],
): Promise<void> {
  const { getSystemSettingsService } = await import('@/lib/server/system');
  const service = getSystemSettingsService();
  const settings = await service.getSettings();
  const next = normalizeMangaTags(mutate([...settings.manga.curatedTags]));
  await service.update({ manga: { curatedTags: next } });
}

function revalidateMangaTagPages(): void {
  revalidatePath('/admin/manga-tags');
  revalidatePath('/admin/mangas');
  revalidatePath('/manga');
}

export async function actionAddMangaTag(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const name = normalizeMangaTagQuery(String(formData.get('name') || ''));
    if (!name) redirect('/admin/manga-tags?error=name');
    await updateCuratedMangaTags((current) => [...current, name]);
    revalidateMangaTagPages();
    redirect(`/admin/manga-tags?ok=added&tag=${encodeURIComponent(name)}`);
  } catch (error) {
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

export async function actionRenameMangaTag(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const from = normalizeMangaTagQuery(String(formData.get('from') || ''));
    const to = normalizeMangaTagQuery(String(formData.get('to') || ''));
    if (!from || !to) redirect('/admin/manga-tags?error=name');
    if (from === to) redirect('/admin/manga-tags');
    const affected = await renameAdminMangaTag(from, to);
    await updateCuratedMangaTags((current) =>
      current.map((tag) => (tag === from ? to : tag)),
    );
    revalidateMangaTagPages();
    redirect(`/admin/manga-tags?ok=renamed&n=${affected}&tag=${encodeURIComponent(to)}`);
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect('/admin/manga-tags?error=name');
    }
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
    throw error;
  }
}

export async function actionDeleteMangaTag(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const name = normalizeMangaTagQuery(String(formData.get('name') || ''));
    if (!name) redirect('/admin/manga-tags?error=name');
    const affected = await removeAdminMangaTag(name);
    await updateCuratedMangaTags((current) => current.filter((tag) => tag !== name));
    revalidateMangaTagPages();
    redirect(`/admin/manga-tags?ok=deleted&n=${affected}&tag=${encodeURIComponent(name)}`);
  } catch (error) {
    if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
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
    const metaTags = parseSiteMetaTagsFromForm(formData);

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
      ads: parseAdsSettingsFromForm(formData),
      manga: {
        enabled: formData.get('mangaEnabled') === '1',
        publishSecret: String(formData.get('mangaPublishSecret') || '') || undefined,
      },
      hero: parseHeroSettingsFromForm(formData),
      site: {
        ...(metaTags === undefined ? {} : { metaTags }),
        androidDownloadUrl: String(formData.get('androidDownloadUrl') || '').trim(),
        androidDownloadLabel: String(formData.get('androidDownloadLabel') || '').trim() || '下载 App',
        telegramUrl: String(formData.get('telegramUrl') || '').trim(),
        telegramLabel: String(formData.get('telegramLabel') || '').trim() || 'Telegram',
      },
    });
    revalidateTag(SITE_META_CACHE_TAG);
    revalidatePath('/', 'layout');
    revalidatePath('/admin/settings');
    revalidatePath('/');
    revalidatePath('/login');
    revalidatePath('/register');
    revalidatePath('/watch');
    revalidatePath('/browse');
    revalidatePath('/manga');
    redirect('/admin/settings?ok=1');
  } catch (error) {
    if (error instanceof AppError) {
      if (isAuthRequiredError(error)) redirect('/admin/login?error=1');
      if (error.message.includes('SMTP')) redirect('/admin/settings?error=verify_smtp');
      if (error.details?.field === 'siteMetaTags') redirect('/admin/settings?error=meta');
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
