import { NextResponse } from 'next/server';
import { getIdentityService } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export async function POST() {
  await getIdentityService().logout();
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
