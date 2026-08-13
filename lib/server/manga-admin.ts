import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { AppError } from '@/lib/server/shared/errors';
import { db, withDbRetry } from '@/lib/db';
import {
  normalizeMangaTagQuery,
  normalizeMangaTags,
  parseMangaTags,
} from '@/lib/manga-tags';
import { mangaChapters, mangaPages, mangas } from '@/lib/schema';

export type AdminMangaListResult = {
  data: Array<typeof mangas.$inferSelect>;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AdminMangaDetail = typeof mangas.$inferSelect;

export type AdminMangaChapter = {
  id: number;
  number: number;
  title: string | null;
  pageCount: number;
  isPublished: number;
  sourceKey: string;
  createdAt: Date | null;
};

export type AdminMangaPageItem = {
  id: number;
  chapterId: number;
  chapterNumber: number;
  index: number;
  imageUrl: string;
};

export type AdminMangaPageList = {
  data: AdminMangaPageItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AdminRelatedManga = {
  id: number;
  title: string;
  coverUrl: string | null;
  pageCount: number;
  isPublished: number;
};

function requireId(value: number, label = '无效 ID'): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AppError('RESULT_INVALID', label, 400);
  }
  return value;
}

export async function listAdminMangas(params?: {
  page?: number;
  limit?: number;
  q?: string;
}): Promise<AdminMangaListResult> {
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 30));
  const q = params?.q?.trim();
  const where = q
    ? or(
        like(mangas.title, `%${q}%`),
        like(mangas.slug, `%${q}%`),
        like(mangas.sourceChatTitle, `%${q}%`),
      )
    : undefined;

  return withDbRetry(async () => {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mangas)
      .where(where);
    const total = Number(countRow?.count ?? 0);
    const rows = await db
      .select()
      .from(mangas)
      .where(where)
      .orderBy(desc(mangas.updatedAt), desc(mangas.id))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      data: rows,
      page,
      limit,
      total,
      totalPages: total ? Math.ceil(total / limit) : 1,
    };
  });
}

export async function getAdminManga(id: number): Promise<AdminMangaDetail | null> {
  requireId(id);
  return withDbRetry(async () => {
    const [manga] = await db.select().from(mangas).where(eq(mangas.id, id)).limit(1);
    return manga ?? null;
  });
}

export async function listAdminMangaChapters(mangaId: number): Promise<AdminMangaChapter[]> {
  requireId(mangaId);
  return withDbRetry(async () => {
    const rows = await db
      .select()
      .from(mangaChapters)
      .where(eq(mangaChapters.mangaId, mangaId))
      .orderBy(mangaChapters.number);
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      pageCount: row.pageCount ?? 0,
      isPublished: row.isPublished ?? 0,
      sourceKey: row.sourceKey,
      createdAt: row.createdAt ?? null,
    }));
  });
}

export async function listAdminMangaPages(
  mangaId: number,
  params?: { page?: number; limit?: number; chapterId?: number; all?: boolean },
): Promise<AdminMangaPageList> {
  requireId(mangaId);
  const all = params?.all === true;
  const page = Math.max(1, params?.page ?? 1);
  const limit = all ? 0 : Math.min(80, Math.max(1, params?.limit ?? 24));
  const chapterId = params?.chapterId && Number.isSafeInteger(params.chapterId) && params.chapterId > 0
    ? params.chapterId
    : undefined;

  return withDbRetry(async () => {
    const conditions = [eq(mangaChapters.mangaId, mangaId)];
    if (chapterId) conditions.push(eq(mangaChapters.id, chapterId));
    const where = and(...conditions);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(mangaPages)
      .innerJoin(mangaChapters, eq(mangaPages.chapterId, mangaChapters.id))
      .where(where);
    const total = Number(countRow?.count ?? 0);
    const totalPages = all ? 1 : total ? Math.ceil(total / limit) : 1;
    const currentPage = all ? 1 : Math.min(totalPages, page);

    let query = db
      .select({
        id: mangaPages.id,
        chapterId: mangaPages.chapterId,
        chapterNumber: mangaChapters.number,
        index: mangaPages.index,
        imageUrl: mangaPages.imageUrl,
      })
      .from(mangaPages)
      .innerJoin(mangaChapters, eq(mangaPages.chapterId, mangaChapters.id))
      .where(where)
      .orderBy(mangaChapters.number, mangaPages.index);

    const rows = all
      ? await query
      : await query.limit(limit).offset((currentPage - 1) * limit);

    return {
      data: rows,
      page: currentPage,
      limit: all ? total : limit,
      total,
      totalPages,
    };
  });
}

export async function listAdminRelatedMangas(
  mangaId: number,
  tags: string[],
  limit = 8,
): Promise<AdminRelatedManga[]> {
  requireId(mangaId);
  const needles = tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 6);
  if (!needles.length) return [];

  return withDbRetry(async () => {
    const tagMatch = or(
      ...needles.map((tag) =>
        sql`JSON_VALID(${mangas.tags}) AND JSON_CONTAINS(${mangas.tags}, JSON_QUOTE(${tag}))`,
      ),
    );
    const rows = await db
      .select({
        id: mangas.id,
        title: mangas.title,
        coverUrl: mangas.coverUrl,
        pageCount: mangas.pageCount,
        isPublished: mangas.isPublished,
      })
      .from(mangas)
      .where(and(sql`${mangas.id} <> ${mangaId}`, tagMatch))
      .orderBy(desc(mangas.updatedAt), desc(mangas.id))
      .limit(Math.min(16, Math.max(1, limit)));
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      coverUrl: row.coverUrl,
      pageCount: row.pageCount ?? 0,
      isPublished: row.isPublished ?? 0,
    }));
  });
}

async function refreshMangaAggregates(
  tx: { select: typeof db.select; update: typeof db.update },
  mangaId: number,
) {
  const [chapterCountRow] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(mangaChapters)
    .where(eq(mangaChapters.mangaId, mangaId));
  const [pageCountRow] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(mangaPages)
    .innerJoin(mangaChapters, eq(mangaPages.chapterId, mangaChapters.id))
    .where(eq(mangaChapters.mangaId, mangaId));
  await tx
    .update(mangas)
    .set({
      chapterCount: Number(chapterCountRow?.count ?? 0),
      pageCount: Number(pageCountRow?.count ?? 0),
      updatedAt: new Date(),
    })
    .where(eq(mangas.id, mangaId));
}

async function refreshChapterPageCount(
  tx: { select: typeof db.select; update: typeof db.update },
  chapterId: number,
) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(mangaPages)
    .where(eq(mangaPages.chapterId, chapterId));
  await tx
    .update(mangaChapters)
    .set({ pageCount: Number(row?.count ?? 0), updatedAt: new Date() })
    .where(eq(mangaChapters.id, chapterId));
}

export async function deleteAdminMangaChapter(mangaId: number, chapterId: number): Promise<void> {
  requireId(mangaId);
  requireId(chapterId);
  await withDbRetry(() =>
    db.transaction(async (tx) => {
      const [chapter] = await tx
        .select({ id: mangaChapters.id })
        .from(mangaChapters)
        .where(and(eq(mangaChapters.id, chapterId), eq(mangaChapters.mangaId, mangaId)))
        .limit(1);
      if (!chapter) throw new AppError('RESULT_INVALID', '章节不存在', 404);
      await tx.delete(mangaPages).where(eq(mangaPages.chapterId, chapterId));
      await tx.delete(mangaChapters).where(eq(mangaChapters.id, chapterId));
      await refreshMangaAggregates(tx, mangaId);
    }),
  );
}

export async function deleteAdminMangaPage(mangaId: number, pageId: number): Promise<void> {
  requireId(mangaId);
  requireId(pageId);
  await withDbRetry(() =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: mangaPages.id,
          chapterId: mangaPages.chapterId,
        })
        .from(mangaPages)
        .innerJoin(mangaChapters, eq(mangaPages.chapterId, mangaChapters.id))
        .where(and(eq(mangaPages.id, pageId), eq(mangaChapters.mangaId, mangaId)))
        .limit(1);
      if (!row) throw new AppError('RESULT_INVALID', '页面不存在', 404);
      await tx.delete(mangaPages).where(eq(mangaPages.id, pageId));
      await refreshChapterPageCount(tx, row.chapterId);
      await refreshMangaAggregates(tx, mangaId);
    }),
  );
}

export async function updateAdminMangaPage(
  mangaId: number,
  pageId: number,
  imageUrl: string,
): Promise<void> {
  requireId(mangaId);
  requireId(pageId);
  const url = imageUrl.trim();
  if (!url) throw new AppError('RESULT_INVALID', '页面链接不能为空', 400);
  if (url.length > 1000) throw new AppError('RESULT_INVALID', '页面链接过长', 400);

  await withDbRetry(async () => {
    const [row] = await db
      .select({ id: mangaPages.id })
      .from(mangaPages)
      .innerJoin(mangaChapters, eq(mangaPages.chapterId, mangaChapters.id))
      .where(and(eq(mangaPages.id, pageId), eq(mangaChapters.mangaId, mangaId)))
      .limit(1);
    if (!row) throw new AppError('RESULT_INVALID', '页面不存在', 404);
    await db.update(mangaPages).set({ imageUrl: url }).where(eq(mangaPages.id, pageId));
    await db.update(mangas).set({ updatedAt: new Date() }).where(eq(mangas.id, mangaId));
  });
}

export async function updateAdminMangaPages(
  mangaId: number,
  items: ReadonlyArray<{ id: number; imageUrl: string }>,
): Promise<void> {
  requireId(mangaId);
  const normalized = items.map((item) => ({
    id: requireId(item.id),
    imageUrl: item.imageUrl.trim(),
  }));
  if (!normalized.length) throw new AppError('RESULT_INVALID', '没有可保存的页面', 400);
  if (normalized.some((item) => !item.imageUrl)) {
    throw new AppError('RESULT_INVALID', '页面链接不能为空', 400);
  }
  if (normalized.some((item) => item.imageUrl.length > 1000)) {
    throw new AppError('RESULT_INVALID', '页面链接过长', 400);
  }

  await withDbRetry(() =>
    db.transaction(async (tx) => {
      for (const item of normalized) {
        const [row] = await tx
          .select({ id: mangaPages.id })
          .from(mangaPages)
          .innerJoin(mangaChapters, eq(mangaPages.chapterId, mangaChapters.id))
          .where(and(eq(mangaPages.id, item.id), eq(mangaChapters.mangaId, mangaId)))
          .limit(1);
        if (!row) throw new AppError('RESULT_INVALID', '页面不存在', 404);
        await tx.update(mangaPages).set({ imageUrl: item.imageUrl }).where(eq(mangaPages.id, item.id));
      }
      await tx.update(mangas).set({ updatedAt: new Date() }).where(eq(mangas.id, mangaId));
    }),
  );
}

export async function setAdminMangaChapterPublished(
  mangaId: number,
  chapterId: number,
  isPublished: number,
): Promise<void> {
  requireId(mangaId);
  requireId(chapterId);
  await withDbRetry(async () => {
    const result = await db
      .update(mangaChapters)
      .set({ isPublished: isPublished ? 1 : 0, updatedAt: new Date() })
      .where(and(eq(mangaChapters.id, chapterId), eq(mangaChapters.mangaId, mangaId)));
    if (Number((result as { affectedRows?: number }).affectedRows ?? 1) === 0) {
      throw new AppError('RESULT_INVALID', '章节不存在', 404);
    }
  });
}

export async function updateAdminManga(input: {
  id: number;
  title: string;
  slug: string;
  author?: string | null;
  tags?: string[] | null;
  description?: string | null;
  coverUrl?: string | null;
  sourceChatTitle?: string | null;
  isPublished: number;
}): Promise<void> {
  const id = requireId(input.id);
  const title = input.title.trim();
  const slug = input.slug.trim();
  if (!title || !slug) {
    throw new AppError('RESULT_INVALID', '标题与 URL 别名必填', 400);
  }
  if (slug.length > 200) {
    throw new AppError('RESULT_INVALID', 'URL 别名不能超过 200 个字符', 400);
  }

  await withDbRetry(() =>
    db.transaction(async (tx) => {
      const [manga] = await tx.select({ id: mangas.id }).from(mangas).where(eq(mangas.id, id)).limit(1);
      if (!manga) throw new AppError('RESULT_INVALID', '漫画不存在', 404);

      const [slugOwner] = await tx
        .select({ id: mangas.id })
        .from(mangas)
        .where(and(eq(mangas.slug, slug), sql`${mangas.id} <> ${id}`))
        .limit(1);
      if (slugOwner) {
        throw new AppError('RESULT_CONFLICT', 'URL 别名已被其他漫画使用', 409);
      }

      await tx
        .update(mangas)
        .set({
          title,
          slug,
          author: input.author?.trim() || null,
          tags: JSON.stringify(normalizeMangaTags(input.tags)),
          description: input.description?.trim() || null,
          coverUrl: input.coverUrl?.trim() || null,
          sourceChatTitle: input.sourceChatTitle?.trim() || null,
          isPublished: input.isPublished ? 1 : 0,
          updatedAt: new Date(),
        })
        .where(eq(mangas.id, id));
    }),
  );
}

export type AdminMangaTagUsage = Readonly<{
  tag: string;
  /** Total mangas carrying the tag (any publish state). */
  count: number;
  /** Published subset, matching what /manga?tag= shows. */
  publishedCount: number;
}>;

/** Aggregate tag usage across all manga rows (tags live on the row as JSON). */
export async function listAdminMangaTagUsage(): Promise<AdminMangaTagUsage[]> {
  return withDbRetry(async () => {
    const rows = await db
      .select({ tags: mangas.tags, isPublished: mangas.isPublished })
      .from(mangas);
    const usage = new Map<string, { count: number; publishedCount: number }>();
    for (const row of rows) {
      for (const tag of parseMangaTags(row.tags)) {
        const entry = usage.get(tag) ?? { count: 0, publishedCount: 0 };
        entry.count += 1;
        if (row.isPublished) entry.publishedCount += 1;
        usage.set(tag, entry);
      }
    }
    return [...usage.entries()]
      .map(([tag, entry]) => ({ tag, ...entry }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hans-CN'));
  });
}

/**
 * Rename a manga tag across every manga row. Renaming to an existing
 * tag merges them (normalizeMangaTags dedupes). Returns affected rows.
 */
export async function renameAdminMangaTag(from: string, to: string): Promise<number> {
  const source = normalizeMangaTagQuery(from);
  const target = normalizeMangaTagQuery(to);
  if (!source || !target) {
    throw new AppError('RESULT_INVALID', '标签名不能为空', 400);
  }
  if (source === target) return 0;

  return withDbRetry(() =>
    db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: mangas.id, tags: mangas.tags })
        .from(mangas);
      let affected = 0;
      for (const row of rows) {
        const current = parseMangaTags(row.tags);
        if (!current.includes(source)) continue;
        const next = normalizeMangaTags(
          current.map((tag) => (tag === source ? target : tag)),
        );
        await tx
          .update(mangas)
          .set({ tags: JSON.stringify(next), updatedAt: new Date() })
          .where(eq(mangas.id, row.id));
        affected += 1;
      }
      return affected;
    }),
  );
}

/** Remove a manga tag from every manga row. Returns affected rows. */
export async function removeAdminMangaTag(tag: string): Promise<number> {
  const needle = normalizeMangaTagQuery(tag);
  if (!needle) {
    throw new AppError('RESULT_INVALID', '标签名不能为空', 400);
  }

  return withDbRetry(() =>
    db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: mangas.id, tags: mangas.tags })
        .from(mangas);
      let affected = 0;
      for (const row of rows) {
        const current = parseMangaTags(row.tags);
        if (!current.includes(needle)) continue;
        const next = current.filter((item) => item !== needle);
        await tx
          .update(mangas)
          .set({
            tags: next.length ? JSON.stringify(next) : null,
            updatedAt: new Date(),
          })
          .where(eq(mangas.id, row.id));
        affected += 1;
      }
      return affected;
    }),
  );
}

export async function setAdminMangaPublished(id: number, isPublished: number): Promise<void> {
  id = requireId(id);
  await withDbRetry(async () => {
    const result = await db
      .update(mangas)
      .set({ isPublished: isPublished ? 1 : 0, updatedAt: new Date() })
      .where(eq(mangas.id, id));
    if (Number((result as { affectedRows?: number }).affectedRows ?? 1) === 0) {
      throw new AppError('RESULT_INVALID', '漫画不存在', 404);
    }
  });
}

export async function deleteAdminManga(id: number): Promise<void> {
  id = requireId(id);
  await withDbRetry(() =>
    db.transaction(async (tx) => {
      const [manga] = await tx.select({ id: mangas.id }).from(mangas).where(eq(mangas.id, id)).limit(1);
      if (!manga) throw new AppError('RESULT_INVALID', '漫画不存在', 404);

      const chapters = await tx
        .select({ id: mangaChapters.id })
        .from(mangaChapters)
        .where(eq(mangaChapters.mangaId, id));
      const chapterIds = chapters.map((chapter) => chapter.id);
      if (chapterIds.length) {
        await tx.delete(mangaPages).where(inArray(mangaPages.chapterId, chapterIds));
        await tx.delete(mangaChapters).where(inArray(mangaChapters.id, chapterIds));
      }
      await tx.delete(mangas).where(eq(mangas.id, id));
    }),
  );
}
