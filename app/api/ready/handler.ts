import { NextResponse } from 'next/server';

export type ReadyQuery = () => Promise<{ ok: boolean; reason?: string }>;

export function createReadyHandler(check: ReadyQuery) {
  return async function readyHandler() {
    try {
      const result = await check();
      if (!result.ok) {
        return NextResponse.json(
          { status: 'not_ready', reason: result.reason ?? 'dependency failed' },
          { status: 503 },
        );
      }
      return NextResponse.json({ status: 'ready' }, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        {
          status: 'not_ready',
          reason: error instanceof Error ? error.message : 'check failed',
        },
        { status: 503 },
      );
    }
  };
}

export function createReadyQueryDependency(
  loadDbPing: () => Promise<() => Promise<void>>,
): ReadyQuery {
  return async () => {
    const ping = await loadDbPing();
    await ping();
    return { ok: true };
  };
}
