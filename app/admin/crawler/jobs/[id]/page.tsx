import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { StatusBadge } from '@/components/admin/crawler/status-badge';
import { actionCancelJob, actionRetryJob } from '../../actions';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const jobId = parseInt(id, 10);
  const detail = await getAdminCrawlerService().listJobDetail(jobId);
  if (!detail) notFound();
  const { job, attempt, items, events, media } = detail;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Job #{job.id}</p>
        <h1 className="font-serif text-3xl flex items-center gap-3">
          任务详情 <StatusBadge status={job.status} />
        </h1>
      </div>
      <CrawlerNav current="/admin/crawler/jobs" />

      <div className="flex flex-wrap gap-3">
        <form action={actionCancelJob}>
          <input type="hidden" name="jobId" value={job.id} />
          <button type="submit" className="btn-ghost">
            取消
          </button>
        </form>
        <form action={actionRetryJob}>
          <input type="hidden" name="jobId" value={job.id} />
          <button type="submit" className="btn-ink">
            手动重试（新任务）
          </button>
        </form>
        <Link href="/admin/crawler/jobs" className="btn-ghost">
          返回列表
        </Link>
      </div>

      <section className="surface-card p-5 space-y-2">
        <h2 className="font-ui text-sm font-semibold">快照</h2>
        <p className="font-meta text-[12px]">kind={job.kind} · attempts={job.attemptCount}/{job.maxAttempts}</p>
        <p className="font-meta text-[12px]">profileVersion={job.profileVersionId} · schedule={job.scheduleId ?? '—'}</p>
        <pre className="font-mono text-[11px] overflow-auto bg-[#F7F6F3] p-3 rounded max-h-48">
          {job.configSnapshotJson}
        </pre>
      </section>

      {attempt && (
        <section className="surface-card p-5 space-y-2">
          <h2 className="font-ui text-sm font-semibold">当前 Attempt</h2>
          <p className="font-meta text-[12px]">
            #{attempt.id} · no={attempt.attemptNo} · worker={attempt.workerId} ·{' '}
            {attempt.resultStatus}
          </p>
          <p className="font-meta text-[12px] text-[#787774]">
            lease expires {attempt.leaseExpiresAt}
          </p>
        </section>
      )}

      <section className="surface-card p-5 space-y-2">
        <h2 className="font-ui text-sm font-semibold">条目 ({items.length})</h2>
        {items.length === 0 ? (
          <p className="font-meta text-[12px] text-[#787774]">无条目</p>
        ) : (
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it.id} className="font-meta text-[12px] flex gap-2">
                <StatusBadge status={it.status} />
                <span>
                  {it.source}:{it.sourceId}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card p-5 space-y-2">
        <h2 className="font-ui text-sm font-semibold">事件 / 日志</h2>
        {events.length === 0 ? (
          <p className="font-meta text-[12px] text-[#787774]">无事件</p>
        ) : (
          <ul className="space-y-1 max-h-64 overflow-auto">
            {events.map((ev) => (
              <li key={ev.id} className="font-mono text-[11px]">
                [{ev.sequence}] {ev.level} {ev.eventType} {ev.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card p-5 space-y-2">
        <h2 className="font-ui text-sm font-semibold">媒体预留</h2>
        {media.length === 0 ? (
          <p className="font-meta text-[12px] text-[#787774]">无预留</p>
        ) : (
          <ul className="space-y-1">
            {media.map((m) => (
              <li key={m.id} className="font-mono text-[11px] break-all">
                {m.status}: {m.stagingKey} → {m.finalKey}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
