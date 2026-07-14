import { createWorkerHandlers } from '@/lib/server/crawler/interfaces/create-worker-handlers';
import { getWorkerApiDeps } from '@/lib/server/crawler/interfaces/worker-api-deps';

/**
 * Production entry: resolve deps once per process (lazy via getWorkerApiDeps).
 * Tests call createWorkerHandlers directly with in-memory deps.
 */
export function getProductionWorkerHandlers() {
  return createWorkerHandlers(getWorkerApiDeps());
}
