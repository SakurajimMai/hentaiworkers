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

/** Toggle anime_works (MacCMS external catalog), not legacy animes. */
export async function actionToggleWork(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const id = parseInt(String(formData.get('id') || ''), 10);
    const isActive = formData.get('isActive') === '1';
    const { getWorksQueryService } = await import('@/lib/server/works');
    await getWorksQueryService().setActive(id, isActive);
    revalidatePath('/admin/works');
    revalidatePath(`/admin/works/${id}`);
    revalidatePath('/works');
    revalidatePath(`/works/${id}`);
    redirect('/admin/works');
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    throw error;
  }
}

function parseSelectedIds(formData: FormData): number[] {
  return [
    ...new Set(
      formData
        .getAll('ids')
        .map((v) => parseInt(String(v), 10))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
}

/** Hard-delete one anime_works row (+ sources/tags). */
export async function actionDeleteWork(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const id = parseInt(String(formData.get('id') || ''), 10);
    const { getWorksQueryService } = await import('@/lib/server/works');
    await getWorksQueryService().delete(id);
    revalidatePath('/admin/works');
    revalidatePath('/works');
    redirect('/admin/works?ok=deleted');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect('/admin/works?error=id');
    }
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    throw error;
  }
}

/** Batch delete / activate / deactivate for anime_works. */
export async function actionBatchWorks(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const ids = parseSelectedIds(formData);
    const op = String(formData.get('op') || '').trim();
    if (!ids.length) {
      redirect('/admin/works?error=batch_empty');
    }
    const { getWorksQueryService } = await import('@/lib/server/works');
    const svc = getWorksQueryService();
    if (op === 'delete') {
      const n = await svc.deleteMany(ids);
      revalidatePath('/admin/works');
      revalidatePath('/works');
      redirect(`/admin/works?ok=batch_delete&n=${n}`);
    }
    if (op === 'activate' || op === 'deactivate') {
      const n = await svc.setActiveMany(ids, op === 'activate');
      revalidatePath('/admin/works');
      revalidatePath('/works');
      redirect(`/admin/works?ok=batch_${op}&n=${n}`);
    }
    redirect('/admin/works?error=batch_op');
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    // Next.js redirect throws; rethrow
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    throw error;
  }
}

/** Batch delete / activate / deactivate for legacy animes (里番). */
export async function actionBatchAnimes(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const ids = parseSelectedIds(formData);
    const op = String(formData.get('op') || '').trim();
    if (!ids.length) {
      redirect('/admin/animes?error=batch_empty');
    }
    const admin = getAdminCatalogService();
    if (op === 'delete') {
      let n = 0;
      for (const id of ids) {
        try {
          await admin.deleteAnime(id);
          n += 1;
        } catch {
          /* skip missing */
        }
      }
      revalidatePath('/admin/animes');
      revalidatePath('/');
      redirect(`/admin/animes?ok=batch_delete&n=${n}`);
    }
    if (op === 'activate' || op === 'deactivate') {
      let n = 0;
      for (const id of ids) {
        try {
          await admin.setAnimeActive(id, op === 'activate' ? 1 : 0);
          n += 1;
        } catch {
          /* skip */
        }
      }
      revalidatePath('/admin/animes');
      revalidatePath('/');
      redirect(`/admin/animes?ok=batch_${op}&n=${n}`);
    }
    redirect('/admin/animes?error=batch_op');
  } catch (error) {
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    throw error;
  }
}

function parsePlayLinesFromForm(raw: string): Array<{
  name: string;
  flag: string;
  episodes: Array<{ name: string; url: string }>;
}> {
  const text = raw.trim();
  if (!text) return [];
  try {
    const data = JSON.parse(text) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const rec = item as Record<string, unknown>;
        const name = String(rec.name ?? rec.flag ?? '').trim();
        const flag = String(rec.flag ?? rec.name ?? '').trim() || name;
        const episodesRaw = Array.isArray(rec.episodes) ? rec.episodes : [];
        const episodes = episodesRaw
          .map((ep) => {
            if (!ep || typeof ep !== 'object') return null;
            const e = ep as Record<string, unknown>;
            const en = String(e.name ?? '').trim();
            const url = String(e.url ?? '').trim();
            if (!en || !url) return null;
            return { name: en, url };
          })
          .filter((x): x is { name: string; url: string } => !!x);
        if (!name || episodes.length === 0) return null;
        return { name, flag, episodes };
      })
      .filter((x): x is { name: string; flag: string; episodes: Array<{ name: string; url: string }> } => !!x);
  } catch {
    return [];
  }
}

/** Save anime_works detail fields (metadata + default stream + play lines JSON). */
export async function actionSaveWork(formData: FormData): Promise<void> {
  const id = parseInt(String(formData.get('id') || ''), 10);
  try {
    await getIdentityService().requireAdmin();
    if (!Number.isInteger(id) || id <= 0) {
      redirect('/admin/works?error=id');
    }

    const yearRaw = String(formData.get('releaseYear') || '').trim();
    const releaseYear = yearRaw ? parseInt(yearRaw, 10) : null;
    const tagIds = formData
      .getAll('tagIds')
      .map((v) => parseInt(String(v), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const fanart = String(formData.get('fanart') || '')
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const playLinesRaw = String(formData.get('playLinesJson') || '').trim();
    const { getWorksQueryService } = await import('@/lib/server/works');
    const existing = await getWorksQueryService().getById(id, { activeOnly: false });
    if (!existing) {
      redirect('/admin/works?error=id');
    }

    let playLines = existing.playLines.map((line) => ({
      name: line.name,
      flag: line.flag,
      episodes: line.episodes.map((ep) => ({ name: ep.name, url: ep.url })),
    }));
    if (playLinesRaw) {
      // Explicit empty array clears lines; non-empty invalid JSON is rejected.
      if (playLinesRaw === '[]') {
        playLines = [];
      } else {
        const parsed = parsePlayLinesFromForm(playLinesRaw);
        if (parsed.length === 0) {
          redirect(`/admin/works/${id}?error=playlines`);
        }
        playLines = parsed;
      }
    }

    await getWorksQueryService().update(id, {
      title: String(formData.get('title') || ''),
      titleEnglish: String(formData.get('titleEnglish') || '') || null,
      titleJapanese: String(formData.get('titleJapanese') || '') || null,
      description: String(formData.get('description') || '') || null,
      coverUrl: String(formData.get('coverUrl') || '') || null,
      fanartUrls: fanart,
      streamUrl: String(formData.get('streamUrl') || ''),
      streamFormat: String(formData.get('streamFormat') || '') || 'hls',
      releaseYear: releaseYear != null && Number.isFinite(releaseYear) ? releaseYear : null,
      releaseDate: String(formData.get('releaseDate') || '') || null,
      remarks: String(formData.get('remarks') || '') || null,
      actors: String(formData.get('actors') || '') || null,
      directors: String(formData.get('directors') || '') || null,
      aliases: String(formData.get('aliases') || '') || null,
      area: String(formData.get('area') || '') || null,
      lang: String(formData.get('lang') || '') || null,
      sourceUpdatedAt: String(formData.get('sourceUpdatedAt') || '') || null,
      isActive: formData.get('isActive') === '1',
      tagIds,
      playLines,
    });

    revalidatePath('/admin/works');
    revalidatePath(`/admin/works/${id}`);
    revalidatePath('/works');
    revalidatePath(`/works/${id}`);
    redirect(`/admin/works/${id}?ok=1`);
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect(`/admin/works/${id}?error=required`);
    }
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
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
    redirect('/admin/tags?scope=rifan');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_INVALID') {
      redirect('/admin/tags?scope=rifan&error=name');
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
    redirect('/admin/tags?scope=rifan');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RESULT_CONFLICT') {
      const count = Number(error.details?.count ?? 0);
      redirect(`/admin/tags?scope=rifan&error=linked&count=${count}`);
    }
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    throw error;
  }
}

/** 动漫外链标签字典 work_tags（与里番 tags 分离）。 */
export async function actionSaveWorkTag(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const idRaw = formData.get('id');
    const id = idRaw ? parseInt(String(idRaw), 10) : null;
    const name = String(formData.get('name') || '').trim();
    const description = String(formData.get('description') || '') || null;
    if (!name) redirect('/admin/tags?scope=anime&error=name');

    const { eq } = await import('drizzle-orm');
    const { db } = await import('@/lib/db');
    const { workTags } = await import('@/lib/schema');

    if (id && Number.isFinite(id)) {
      await db
        .update(workTags)
        .set({ name, description })
        .where(eq(workTags.id, id));
    } else {
      await db.insert(workTags).values({ name, description });
    }
    revalidatePath('/admin/tags');
    revalidatePath('/admin/works');
    redirect('/admin/tags?scope=anime');
  } catch (error) {
    // next/navigation redirect() throws; rethrow so it is not treated as failure
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      String((error as { digest?: unknown }).digest ?? '').startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }
    if (isAuthRequiredError(error)) {
      redirect('/admin/login?error=1');
    }
    redirect('/admin/tags?scope=anime&error=name');
  }
}

export async function actionDeleteWorkTag(formData: FormData): Promise<void> {
  try {
    await getIdentityService().requireAdmin();
    const id = parseInt(String(formData.get('id') || ''), 10);
    if (!Number.isInteger(id) || id <= 0) {
      redirect('/admin/tags?scope=anime');
    }
    const { eq, sql } = await import('drizzle-orm');
    const { db } = await import('@/lib/db');
    const { animeWorkTags, workTags } = await import('@/lib/schema');
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(animeWorkTags)
      .where(eq(animeWorkTags.tagId, id));
    const count = Number(row?.count ?? 0);
    if (count > 0) {
      redirect(`/admin/tags?scope=anime&error=linked&count=${count}`);
    }
    await db.delete(workTags).where(eq(workTags.id, id));
    revalidatePath('/admin/tags');
    redirect('/admin/tags?scope=anime');
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      String((error as { digest?: unknown }).digest ?? '').startsWith('NEXT_REDIRECT')
    ) {
      throw error;
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
    revalidatePath('/works');
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
