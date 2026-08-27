/**
 * Local manga catalog (MySQL). Ingest via POST /api/manga/publish with admin key.
 */
import { and, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  cleanMangaDisplayTitle,
  normalizeMangaTagQuery,
  normalizeMangaTags,
  parseMangaTags,
} from '@/lib/manga-tags';
import { ensureMangaViewsReady, mangaRankSince, type MangaRank } from '@/lib/manga-views';
import { mangaChapters, mangaPages, mangas } from '@/lib/schema';

export type { MangaRank } from '@/lib/manga-views';

/** Filter published manga by a manga-owned tag. Never reads 里番 `tags`. */
function mangaTagSql(tag: string): SQL | undefined {
  const needle = normalizeMangaTagQuery(tag);
  if (!needle) return undefined;
  return or(
    sql`JSON_VALID(${mangas.tags}) AND JSON_CONTAINS(${mangas.tags}, JSON_QUOTE(${needle}))`,
    and(
      sql`${mangas.tags} IS NOT NULL AND NOT JSON_VALID(${mangas.tags})`,
      or(
        eq(mangas.tags, needle),
        like(mangas.tags, `${needle},%`),
        like(mangas.tags, `%,${needle}`),
        like(mangas.tags, `%,${needle},%`),
      ),
    ),
  );
}

export type MangaSummary = {
  id: number;
  slug: string;
  title: string;
  author: string | null;
  tags: string[];
  description: string | null;
  coverUrl: string | null;
  chapterCount: number;
  pageCount: number;
  sourceChatTitle: string | null;
  updatedAt: Date | null;
};

export type ChapterSummary = {
  id: number;
  number: number;
  title: string | null;
  pageCount: number;
  createdAt: Date | null;
};

export type MangaDetail = MangaSummary & {
  chapters: ChapterSummary[];
};

export type MangaPage = {
  index: number;
  imageUrl: string;
};

export type ChapterDetail = ChapterSummary & {
  pages: MangaPage[];
};

export type MangaListResult = {
  data: MangaSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

function normalizeSlug(value: string): string {
  let normalized = value.trim();
  // Proxies and framework adapters can leave one or more URL-encoding layers
  // on a dynamic path segment. Generated slugs never contain percent escapes,
  // so decoding here is safe and keeps detail/read routes consistent.
  for (let i = 0; i < 2 && normalized.includes('%'); i += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  return normalized.normalize('NFKC');
}

function slugify(value: string, maxLength = 80): string {
  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_/\\|]+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  const base = normalized || 'manga';
  return base.slice(0, maxLength);
}

function mapManga(row: typeof mangas.$inferSelect): MangaSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author,
    tags: parseMangaTags(row.tags),
    description: row.description,
    coverUrl: row.coverUrl,
    chapterCount: row.chapterCount ?? 0,
    pageCount: row.pageCount ?? 0,
    sourceChatTitle: row.sourceChatTitle,
    updatedAt: row.updatedAt ?? null,
  };
}

export async function listMangas(params?: {
  page?: number;
  limit?: number;
  q?: string;
  tag?: string;
  rank?: MangaRank;
}): Promise<MangaListResult> {
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.min(100, Math.max(1, params?.limit ?? 24));
  const q = params?.q?.trim();
  const tag = normalizeMangaTagQuery(params?.tag);
  const rank = params?.rank;

  const conditions = [eq(mangas.isPublished, 1)];
  if (q) {
    const textMatch = [
      like(mangas.title, `%${q}%`),
      like(mangas.author, `%${q}%`),
      mangaTagSql(q),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
    conditions.push(or(...textMatch)!);
  }
  if (tag) {
    const tagMatch = mangaTagSql(tag);
    if (tagMatch) conditions.push(tagMatch);
  }
  const where = and(...conditions);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mangas)
    .where(where);
  const total = Number(countRow?.count ?? 0);

  let orderBy = [desc(mangas.updatedAt)];
  if (rank) {
    await ensureMangaViewsReady();
    const since = mangaRankSince(rank);
    const score = since
      ? sql<number>`COALESCE((
          SELECT SUM(view_count) FROM manga_view_days
          WHERE manga_id = ${mangas.id} AND day >= ${since}
        ), 0)`
      : sql<number>`COALESCE((
          SELECT SUM(view_count) FROM manga_view_days
          WHERE manga_id = ${mangas.id}
        ), 0)`;
    orderBy = [desc(score), desc(mangas.updatedAt)];
  }

  const rows = await db
    .select()
    .from(mangas)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    data: rows.map(mapManga),
    page,
    limit,
    total,
    totalPages: total ? Math.ceil(total / limit) : 0,
  };
}

/** Top used tags across published mangas, most-used first. */
export async function listTopMangaTags(limit = 24): Promise<string[]> {
  const rows = await db
    .select({ tags: mangas.tags })
    .from(mangas)
    .where(eq(mangas.isPublished, 1));
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of parseMangaTags(row.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .slice(0, Math.max(1, limit))
    .map(([tag]) => tag);
}

export async function listPublishedMangaSitemapData(): Promise<
  Array<{ id: number; slug: string; updatedAt: Date | null }>
> {
  const rows = await db
    .select({ id: mangas.id, slug: mangas.slug, updatedAt: mangas.updatedAt })
    .from(mangas)
    .where(eq(mangas.isPublished, 1))
    .orderBy(desc(mangas.updatedAt));
  return rows;
}

export async function getMangaBySlug(slug: string): Promise<MangaDetail | null> {
  const normalizedSlug = normalizeSlug(slug);
  const [row] = await db
    .select()
    .from(mangas)
    .where(and(eq(mangas.slug, normalizedSlug), eq(mangas.isPublished, 1)))
    .limit(1);
  if (!row) {
    if (/^\d+$/.test(normalizedSlug)) {
      const [byId] = await db
        .select()
        .from(mangas)
        .where(and(eq(mangas.id, parseInt(normalizedSlug, 10)), eq(mangas.isPublished, 1)))
        .limit(1);
      if (!byId) return null;
      return attachChapters(byId);
    }
    return null;
  }
  return attachChapters(row);
}

async function attachChapters(row: typeof mangas.$inferSelect): Promise<MangaDetail> {
  const chapters = await db
    .select()
    .from(mangaChapters)
    .where(and(eq(mangaChapters.mangaId, row.id), eq(mangaChapters.isPublished, 1)))
    .orderBy(mangaChapters.number);
  return {
    ...mapManga(row),
    chapters: chapters.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      pageCount: c.pageCount ?? 0,
      createdAt: c.createdAt ?? null,
    })),
  };
}

export async function getChapter(
  slug: string,
  number: number,
): Promise<ChapterDetail | null> {
  const manga = await getMangaBySlug(slug);
  if (!manga) return null;
  const [chapter] = await db
    .select()
    .from(mangaChapters)
    .where(
      and(
        eq(mangaChapters.mangaId, manga.id),
        eq(mangaChapters.number, number),
        eq(mangaChapters.isPublished, 1),
      ),
    )
    .limit(1);
  if (!chapter) return null;
  const pages = await db
    .select()
    .from(mangaPages)
    .where(eq(mangaPages.chapterId, chapter.id))
    .orderBy(mangaPages.index);
  return {
    id: chapter.id,
    number: chapter.number,
    title: chapter.title,
    pageCount: chapter.pageCount ?? 0,
    createdAt: chapter.createdAt ?? null,
    pages: pages.map((p) => ({ index: p.index, imageUrl: p.imageUrl })),
  };
}

export type PublishMangaInput = {
  title: string;
  author?: string | null;
  tags?: string[] | null;
  chapterTitle?: string | null;
  sourceKey: string;
  sourceChatId?: string | null;
  sourceChatTitle?: string | null;
  imageUrls: string[];
  coverUrl?: string | null;
  description?: string | null;
};

export type PublishMangaResult =
  | { status: 'ok'; mangaId: number; chapterId: number; slug: string; number: number; pageCount: number }
  | { status: 'duplicate'; sourceKey: string; mangaId?: number; chapterId?: number; slug?: string };

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let n = 2;
  for (;;) {
    const [existing] = await db
      .select({ id: mangas.id })
      .from(mangas)
      .where(eq(mangas.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

async function refreshMangaAggregates(
  mangaId: number,
  extras: {
    title?: string | null;
    chapterTitle?: string | null;
    chapterId?: number | null;
    author?: string | null;
    tags?: string[];
    coverUrl?: string | null;
    sourceChatTitle?: string | null;
  } = {},
): Promise<void> {
  const [mangaRow] = await db.select().from(mangas).where(eq(mangas.id, mangaId)).limit(1);
  if (!mangaRow) return;
  const [chapterCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mangaChapters)
    .where(eq(mangaChapters.mangaId, mangaId));
  const [pageCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mangaPages)
    .innerJoin(mangaChapters, eq(mangaPages.chapterId, mangaChapters.id))
    .where(eq(mangaChapters.mangaId, mangaId));
  const nextTitle = extras.title?.trim();
  await db
    .update(mangas)
    .set({
      title: nextTitle || mangaRow.title,
      chapterCount: Number(chapterCountRow?.count ?? 0),
      pageCount: Number(pageCountRow?.count ?? 0),
      author: mangaRow.author || extras.author || null,
      tags: JSON.stringify(
        normalizeMangaTags([...parseMangaTags(mangaRow.tags), ...(extras.tags || [])]),
      ),
      coverUrl: mangaRow.coverUrl || extras.coverUrl || null,
      sourceChatTitle: extras.sourceChatTitle ?? mangaRow.sourceChatTitle,
      updatedAt: new Date(),
    })
    .where(eq(mangas.id, mangaId));
  const nextChapterTitle = extras.chapterTitle?.trim();
  if (nextChapterTitle && extras.chapterId) {
    await db
      .update(mangaChapters)
      .set({ title: nextChapterTitle, updatedAt: new Date() })
      .where(eq(mangaChapters.id, extras.chapterId));
  }
}

async function appendMangaChapterPages(
  chapter: typeof mangaChapters.$inferSelect,
  input: {
    title?: string | null;
    chapterTitle?: string | null;
    author: string | null;
    tags: string[];
    imageUrls: string[];
    coverUrl: string | null;
    sourceChatTitle: string | null;
    sourceKey: string;
  },
): Promise<PublishMangaResult> {
  const existingPages = await db
    .select()
    .from(mangaPages)
    .where(eq(mangaPages.chapterId, chapter.id))
    .orderBy(mangaPages.index);
  const seen = new Set(existingPages.map((page) => page.imageUrl));
  const toAdd = input.imageUrls.filter((url) => url && !seen.has(url));
  const [mangaRow] = await db.select().from(mangas).where(eq(mangas.id, chapter.mangaId)).limit(1);

  // 同源再采：图片可能被重新传到图床变成新 URL。页数没有增加时一律视为重复，
  // 既不追加页面，也不刷新 updatedAt。
  if (toAdd.length === 0 || existingPages.length >= input.imageUrls.length) {
    return {
      status: 'duplicate',
      sourceKey: input.sourceKey,
      mangaId: chapter.mangaId,
      chapterId: chapter.id,
      slug: mangaRow?.slug,
    };
  }

  const nextIndex =
    existingPages.length === 0
      ? 0
      : Math.max(...existingPages.map((page) => Number(page.index) || 0)) + 1;
  await db.insert(mangaPages).values(
    toAdd.map((url, offset) => ({
      chapterId: chapter.id,
      index: nextIndex + offset,
      imageUrl: url,
    })),
  );
  const pageCount = existingPages.length + toAdd.length;
  await db
    .update(mangaChapters)
    .set({
      pageCount,
      updatedAt: new Date(),
    })
    .where(eq(mangaChapters.id, chapter.id));
  await refreshMangaAggregates(chapter.mangaId, {
    title: input.title,
    chapterTitle: input.chapterTitle,
    chapterId: chapter.id,
    author: input.author,
    tags: input.tags,
    coverUrl: input.coverUrl,
    sourceChatTitle: input.sourceChatTitle,
  });
  return {
    status: 'ok',
    mangaId: chapter.mangaId,
    chapterId: chapter.id,
    slug: mangaRow?.slug || '',
    number: chapter.number,
    pageCount,
  };
}

export async function publishMangaChapter(
  input: PublishMangaInput,
): Promise<PublishMangaResult> {
  const title = cleanMangaDisplayTitle(input.title) || input.title.trim();
  const author = input.author?.trim() || null;
  const tags = normalizeMangaTags(input.tags);
  const imageUrls = input.imageUrls.map((u) => u.trim()).filter(Boolean);
  const sourceKey = input.sourceKey.trim();
  if (!title || !sourceKey || imageUrls.length === 0) {
    throw new Error('title, sourceKey and imageUrls are required');
  }

  const [dup] = await db
    .select()
    .from(mangaChapters)
    .where(eq(mangaChapters.sourceKey, sourceKey))
    .limit(1);
  if (dup) {
    return appendMangaChapterPages(dup, {
      title,
      chapterTitle: cleanMangaDisplayTitle(input.chapterTitle) || input.chapterTitle?.trim() || title,
      author,
      tags,
      imageUrls,
      coverUrl: input.coverUrl ?? null,
      sourceChatTitle: input.sourceChatTitle ?? null,
      sourceKey,
    });
  }

  // Find or create manga by title + optional source chat
  let mangaRow: typeof mangas.$inferSelect | undefined;
  {
    const conditions = [eq(mangas.title, title)];
    if (input.sourceChatId) {
      conditions.push(eq(mangas.sourceChatId, input.sourceChatId));
    }
    const [found] = await db
      .select()
      .from(mangas)
      .where(and(...conditions))
      .limit(1);
    mangaRow = found;
  }

  if (!mangaRow) {
    const slug = await uniqueSlug(slugify(title));
    const cover = input.coverUrl || imageUrls[0] || null;
    const insertResult = await db.insert(mangas).values({
      slug,
      title,
      author,
      tags: tags.length ? JSON.stringify(tags) : null,
      description: input.description ?? null,
      coverUrl: cover,
      sourceChatId: input.sourceChatId ?? null,
      sourceChatTitle: input.sourceChatTitle ?? null,
      chapterCount: 0,
      pageCount: 0,
      isPublished: 1,
    });
    const insertId = Number((insertResult[0] as { insertId?: number }).insertId ?? 0);
    const [created] = await db.select().from(mangas).where(eq(mangas.id, insertId)).limit(1);
    mangaRow = created;
  }

  if (!mangaRow) {
    throw new Error('Failed to create manga');
  }

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(${mangaChapters.number}), 0)` })
    .from(mangaChapters)
    .where(eq(mangaChapters.mangaId, mangaRow.id));
  const number = Number(maxRow?.max ?? 0) + 1;

  const chapterInsert = await db.insert(mangaChapters).values({
    mangaId: mangaRow.id,
    number,
    title: cleanMangaDisplayTitle(input.chapterTitle) || input.chapterTitle?.trim() || `第 ${number} 话`,
    sourceKey,
    pageCount: imageUrls.length,
    isPublished: 1,
  });
  const chapterId = Number((chapterInsert[0] as { insertId?: number }).insertId ?? 0);

  if (imageUrls.length) {
    await db.insert(mangaPages).values(
      imageUrls.map((url, index) => ({
        chapterId,
        index,
        imageUrl: url,
      })),
    );
  }

  // Refresh aggregates
  const [chapterCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mangaChapters)
    .where(eq(mangaChapters.mangaId, mangaRow.id));
  const [pageCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mangaPages)
    .innerJoin(mangaChapters, eq(mangaPages.chapterId, mangaChapters.id))
    .where(eq(mangaChapters.mangaId, mangaRow.id));

  await db
    .update(mangas)
    .set({
      chapterCount: Number(chapterCountRow?.count ?? 0),
      pageCount: Number(pageCountRow?.count ?? 0),
      author: mangaRow.author || author,
      tags: JSON.stringify(normalizeMangaTags([
        ...parseMangaTags(mangaRow.tags),
        ...tags,
      ])),
      coverUrl: mangaRow.coverUrl || input.coverUrl || imageUrls[0] || null,
      sourceChatTitle: input.sourceChatTitle ?? mangaRow.sourceChatTitle,
    })
    .where(eq(mangas.id, mangaRow.id));

  return {
    status: 'ok',
    mangaId: mangaRow.id,
    chapterId,
    slug: mangaRow.slug,
    number,
    pageCount: imageUrls.length,
  };
}
