import type { WorkerRecord } from '../ports/worker-repository';

export type WorkerDisplayState = Readonly<{
  connection: 'online' | 'offline';
  lifecycle: 'active' | 'draining' | 'paused' | 'disabled';
  currentLoad: number;
  sources: readonly string[];
}>;

export function deriveWorkerDisplayState(
  worker: WorkerRecord,
  nowMs = Date.now(),
  onlineWindowMs = 90_000,
): WorkerDisplayState {
  let currentLoad = 0;
  let sources: readonly string[] = [];
  try {
    const capabilities = JSON.parse(worker.capabilitiesJson) as Record<string, unknown>;
    if (
      typeof capabilities.currentLoad === 'number'
      && Number.isFinite(capabilities.currentLoad)
      && capabilities.currentLoad >= 0
    ) {
      currentLoad = capabilities.currentLoad;
    }
    if (Array.isArray(capabilities.sources)) {
      sources = capabilities.sources.filter(
        (source): source is string => typeof source === 'string' && source.length > 0,
      );
    }
  } catch {
    // Invalid historical capability JSON is displayed as an empty capability set.
  }

  const heartbeatMs = worker.lastHeartbeatAt
    ? new Date(worker.lastHeartbeatAt).getTime()
    : Number.NaN;
  const connection = Number.isFinite(heartbeatMs) && heartbeatMs >= nowMs - onlineWindowMs
    ? 'online'
    : 'offline';
  const lifecycle = !worker.isEnabled
    ? 'disabled'
    : worker.claimEnabled
      ? 'active'
      : currentLoad > 0
        ? 'draining'
        : 'paused';

  return { connection, lifecycle, currentLoad, sources };
}
