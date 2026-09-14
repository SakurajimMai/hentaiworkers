import { NextResponse } from 'next/server';
import { getSitemapSource, sitemapBaseUrl } from '@/lib/server/seo/sitemap-source';
import { SITEMAP_CACHE_CONTROL, buildSitemapIndex, renderSitemapIndex } from '@/lib/sitemap';

export const dynamic = 'force-dynamic';

/** Sitemap index: lists the chunked per-section sitemaps under /sitemaps/*.xml. */
export async function GET() {
  try {
    const xml = renderSitemapIndex(buildSitemapIndex(sitemapBaseUrl(), await getSitemapSource()));
    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': SITEMAP_CACHE_CONTROL,
      },
    });
  } catch (error) {
    console.error('[sitemap] index failed', error);
    return new NextResponse('Sitemap unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
