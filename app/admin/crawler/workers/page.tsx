import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerWorkersPage() {
  await requireAdmin();
  const workers = await getAdminCrawlerService().listWorkers();
  const threshold = Date.now() - 90_000;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Workers</p>
        <h1 className="font-serif text-3xl">Worker 节点</h1>
      </div>
      <CrawlerNav current="/admin/crawler/workers" />

      <ul className="space-y-2">
        {workers.map((w) => {
          const online =
            w.lastHeartbeatAt != null
            && new Date(w.lastHeartbeatAt).getTime() >= threshold;
          return (
            <li key={w.id} className="surface-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-ui text-sm">
                    #{w.id} {w.name}
                  </p>
                  <p className="font-meta text-[12px] text-[#787774]">
                    v{w.version} · heartbeat {w.lastHeartbeatAt ?? 'never'}
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
              <pre className="mt-2 font-mono text-[11px] overflow-auto max-h-24 text-[#787774]">
                {w.capabilitiesJson}
              </pre>
            </li>
          );
        })}
        {workers.length === 0 && (
          <p className="font-meta text-[13px] text-[#787774]">
            尚无 Worker。使用机器令牌调用 /api/internal/crawler/v1/workers/register 注册。
          </p>
        )}
      </ul>
    </div>
  );
}
