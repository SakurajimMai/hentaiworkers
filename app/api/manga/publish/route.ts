import { NextResponse } from 'next/server';
import { AppError } from '@/lib/server/shared/errors';
import { getSystemSettingsService } from '@/lib/server/system';
import { publishMangaChapter } from '@/lib/manga-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type PublishBody = {
  title?: string;
  author?: string | null;
  tags?: string[] | null;
  tagNames?: string[] | null;
  chapterTitle?: string | null;
  sourceKey?: string;
  sourceChatId?: string | null;
  sourceChatTitle?: string | null;
  imageUrls?: string[];
  coverUrl?: string | null;
  description?: string | null;
  // snake_case aliases accepted from workers
  chapter_title?: string | null;
  author_name?: string | null;
  tag_names?: string[] | null;
  source_key?: string;
  source_chat_id?: string | null;
  source_chat_title?: string | null;
  image_urls?: string[];
  cover_url?: string | null;
};

function extractPublishKey(req: Request): string | null {
  const headerKey = req.headers.get('x-manga-publish-key');
  if (headerKey?.trim()) return headerKey.trim();
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const settings = getSystemSettingsService();
    await settings.assertMangaPublishKey(extractPublishKey(req));

    let body: PublishBody;
    try {
      body = (await req.json()) as PublishBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const title = (body.title || '').trim();
    const imageUrls = body.imageUrls ?? body.image_urls ?? [];
    const sourceKey = (body.sourceKey ?? body.source_key ?? '').trim();
    const tags = body.tags ?? body.tagNames ?? body.tag_names ?? [];

    if (!title || !sourceKey || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { error: 'title, sourceKey, and imageUrls[] are required' },
        { status: 400 },
      );
    }

    const result = await publishMangaChapter({
      title,
      author: body.author ?? body.author_name ?? null,
      tags: Array.isArray(tags) ? tags.map(String) : [],
      chapterTitle: body.chapterTitle ?? body.chapter_title ?? null,
      sourceKey,
      sourceChatId: body.sourceChatId ?? body.source_chat_id ?? null,
      sourceChatTitle: body.sourceChatTitle ?? body.source_chat_title ?? null,
      imageUrls: imageUrls.map(String),
      coverUrl: body.coverUrl ?? body.cover_url ?? null,
      description: body.description ?? null,
    });

    return NextResponse.json(result, {
      status: result.status === 'ok' ? 201 : 200,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status || 400 },
      );
    }
    console.error('[manga/publish]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
