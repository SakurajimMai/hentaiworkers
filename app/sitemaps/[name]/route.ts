import { NextResponse } from 'next/server';
import { getSitemapSource, sitemapBaseUrl } from '@/lib/server/seo/sitemap-source';
import {
  SITEMAP_CACHE_CONTROL,
  buildSitemapSection,
  parseSitemapSectionName,
  renderUrlSet,
} from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

/** One chunked section: pages.xml, animes-N.xml, mangas-N.xml, tags-N.xml, manga-tags-N.xml. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const ref = parseSitemapSectionName(name);
  if (!ref) return new NextResponse('Not found', { status: 404 });
  try {
    const file = buildSitemapSection(sitemapBaseUrl(), await getSitemapSource(), ref);
    if (!file) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(renderUrlSet(file.entries), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': SITEMAP_CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error('[sitemap] section failed', name, error);
    return new NextResponse('Sitemap unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
