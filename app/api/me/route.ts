import { NextResponse } from 'next/server';
import { getIdentityService } from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getIdentityService().getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(
    {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
