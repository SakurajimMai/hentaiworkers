import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { WorkerProvisionForm } from '@/components/admin/crawler/worker-provision-form';
import { WorkerActions } from '@/components/admin/crawler/worker-actions';
import { deriveWorkerDisplayState } from '@/lib/server/crawler/application/worker-display-state';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerWorkersPage() {
  await requireAdmin();
  const service = getAdminCrawlerService();
  const workers = await service.listWorkers();
  const credentials = new Map(
    await Promise.all(
      workers.map(async (worker) => [worker.id, await service.listWorkerCredentials(worker.id)] as const),
    ),
  );
  const nowMs = Date.now();

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Workers</p>
        <h1 className="font-serif text-3xl">Worker 节点</h1>
      </div>
      <CrawlerNav current="/admin/crawler/workers" />
      <WorkerProvisionForm />

      <ul className="divide-y divide-[#EAEAEA] border-y border-[#EAEAEA] bg-white">
        {workers.map((worker) => {
          const state = deriveWorkerDisplayState(worker, nowMs);
          const workerCredentials = credentials.get(worker.id) ?? [];
          const credential = workerCredentials[0] ?? null;
          return (
            <li key={worker.id} className="py-5 px-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-ui text-sm">
                    #{worker.id} {worker.name}
                  </p>
                  <p className="font-meta text-[12px] text-[#787774]">
                    v{worker.version} · heartbeat {worker.lastHeartbeatAt ?? 'never'}
                  </p>
                </div>
                <span
                  className={
                    state.connection === 'online'
                      ? 'font-meta text-[11px] text-[#137333]'
                      : 'font-meta text-[11px] text-[#787774]'
                  }
                >
                  {state.connection} · {state.lifecycle}
                </span>
              </div>
              <p className="font-meta text-[12px] text-[#5F6368]">
                当前负载 {state.currentLoad} · 来源{' '}
                {state.sources.length > 0 ? state.sources.join(', ') : '尚未上报'}
              </p>
              <pre className="font-mono text-[11px] overflow-auto max-h-24 text-[#787774]">
                {worker.capabilitiesJson}
              </pre>
              <div className="space-y-2">
                <p className="font-meta text-[11px] text-[#787774]">凭据</p>
                {workerCredentials.map((credential) => (
                  <div
                    key={credential.id}
                    className="flex flex-wrap items-center justify-between gap-3 text-[12px]"
                  >
                    <span className="font-mono">
                      #{credential.id} · {credential.isRevoked ? 'revoked' : 'active'} ·{' '}
                      {credential.createdAt}
                    </span>
                  </div>
                ))}
              </div>
              <WorkerActions
                workerId={worker.id}
                claimEnabled={worker.claimEnabled}
                isEnabled={worker.isEnabled}
                credentialId={credential?.id ?? null}
                credentialRevoked={credential?.isRevoked ?? true}
              />
            </li>
          );
        })}
        {workers.length === 0 && (
          <li className="py-8 px-4 font-meta text-[13px] text-[#787774]">
            尚无 Worker。请先创建并将一次性令牌配置到 Worker 容器。
          </li>
        )}
      </ul>
    </div>
  );
}
