import { NextResponse } from 'next/server';
import { buildPublicHtmlAdDocument } from '@/lib/server/system/domain/html-ad-slot-document';
import { getSystemSettingsService } from '@/lib/server/system';

export const dynamic = 'force-dynamic';

const DOCUMENT_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export async function GET(
  request: Request,
  context: { params: Promise<{ slot: string[] }> },
) {
  const { slot } = await context.params;
  const query = new URL(request.url).searchParams;
  const mid = query.get('mid');
  const fluid = query.get('fluid') === '1';
  try {
    const ads = await getSystemSettingsService().getPublicAdsConfig();
    const document = buildPublicHtmlAdDocument(ads, slot, mid || 'ad', { fluid });
    if (!document) {
      return new NextResponse('Not found', { status: 404, headers: DOCUMENT_HEADERS });
    }
    return new NextResponse(document, { headers: DOCUMENT_HEADERS });
  } catch (error) {
    console.error(error);
    return new NextResponse('Error', { status: 500, headers: DOCUMENT_HEADERS });
  }
}
