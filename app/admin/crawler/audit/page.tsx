import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerAuditPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Audit</p>
        <h1 className="font-serif text-3xl">审计</h1>
      </div>
      <CrawlerNav current="/admin/crawler/audit" />
      <div className="surface-card p-5 space-y-2">
        <p className="font-ui text-sm">
          审计表 <code className="font-mono text-[12px]">audit_logs</code> 已纳入控制面 schema。
        </p>
        <p className="font-meta text-[13px] text-[#787774]">
          密钥揭示、模板变更、调度保存、任务取消/重试将写入 actor/action/resource 记录。
          MariaDB 审计仓储接线后在此展示时间线；当前进程内控制面以任务/密钥操作日志为准。
        </p>
      </div>
    </div>
  );
}
