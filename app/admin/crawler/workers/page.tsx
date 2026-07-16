import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { WorkerProvisionForm } from '@/components/admin/crawler/worker-provision-form';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { requireAdmin } from '@/lib/auth';
import { actionRevokeWorkerCredential } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CrawlerWorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const service = getAdminCrawlerService();
  const workers = await service.listWorkers();
  const credentials = new Map(
    await Promise.all(
      workers.map(async (worker) => [worker.id, await service.listWorkerCredentials(worker.id)] as const),
    ),
  );
  const threshold = Date.now() - 90_000;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Workers</p>
        <h1 className="font-serif text-3xl">Worker 节点</h1>
      </div>
      <CrawlerNav current="/admin/crawler/workers" />
      {sp.ok === 'revoked' && (
        <p className="font-meta text-[13px] text-[#137333]">凭据已撤销</p>
      )}
      {sp.error && (
        <p className="font-meta text-[13px] text-[#C5221F]">操作失败</p>
      )}

      <WorkerProvisionForm />

      <ul className="divide-y divide-[#EAEAEA] border-y border-[#EAEAEA] bg-white">
        {workers.map((worker) => {
          const online =
            worker.lastHeartbeatAt != null
            && new Date(worker.lastHeartbeatAt).getTime() >= threshold;
          const workerCredentials = credentials.get(worker.id) ?? [];
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
                    online
                      ? 'font-meta text-[11px] text-[#137333]'
                      : 'font-meta text-[11px] text-[#787774]'
                  }
                >
                  {online ? 'online' : 'offline'}
                </span>
              </div>
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
                    {!credential.isRevoked && (
                      <form action={actionRevokeWorkerCredential}>
                        <input type="hidden" name="credentialId" value={credential.id} />
                        <button type="submit" className="font-ui text-[#9F2F2D] underline">
                          撤销
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
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
