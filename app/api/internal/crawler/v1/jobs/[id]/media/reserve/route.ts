import type { NextRequest } from 'next/server';
import { getProductionWorkerHandlers } from '../../../../handlers';

export const dynamic = 'force-dynamic';

/** Maps design path media:reserve → media/reserve. */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  return getProductionWorkerHandlers().mediaReserve(req, params);
}
