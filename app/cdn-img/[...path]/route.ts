import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPSTREAM = 'https://image.ixacg.de';

function safePath(parts: string[]): string | null {
  if (!parts.length) return null;
  const joined = parts.join('/');
  if (!joined || joined.includes('..') || joined.startsWith('/')) return null;
  return joined
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const encoded = safePath(path);
  if (!encoded) {
    return new NextResponse('Bad path', { status: 400 });
  }

  const upstreamUrl = `${UPSTREAM}/${encoded}${request.nextUrl.search}`;
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        Accept: request.headers.get('accept') || 'image/avif,image/webp,image/*,*/*;q=0.8',
        'User-Agent': 'AnimeStream-ImageProxy/1.0',
      },
      redirect: 'follow',
      next: { revalidate: 2592000 },
    });
  } catch {
    return new NextResponse('Image upstream unreachable', { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') || '';
  if (!upstream.ok || (contentType && !contentType.startsWith('image/'))) {
    return new NextResponse('Image not found', { status: upstream.status || 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', contentType || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=2592000, immutable');
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
