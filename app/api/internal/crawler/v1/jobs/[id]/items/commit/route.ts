import type { NextRequest } from 'next/server';
import { getProductionWorkerHandlers } from '../../../../handlers';

export const dynamic = 'force-dynamic';

/** Maps design path items:commit → items/commit. */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  return getProductionWorkerHandlers().itemsCommit(req, params);
}
