import type { NextRequest } from 'next/server';
import { getProductionWorkerHandlers } from '../../../../handlers';

export const dynamic = 'force-dynamic';

/** Lease-protected source mapping lookup for skip_existing before media transfer. */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  return getProductionWorkerHandlers().itemExists(req, params);
}
