import type { NextRequest } from 'next/server';
import { getProductionWorkerHandlers } from '../../handlers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return getProductionWorkerHandlers().claim(req);
}
