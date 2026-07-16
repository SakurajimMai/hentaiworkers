import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { StatusBadge } from '@/components/admin/crawler/status-badge';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { actionCancelJob, actionDeleteJob, actionRetryJob } from '../../actions';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { isTerminalJobStatus } from '@/lib/server/crawler/domain/job';
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
  const { job, attempt, items, events } = detail;

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
        {!isTerminalJobStatus(job.status) && (
          <form action={actionCancelJob}>
            <input type="hidden" name="jobId" value={job.id} />
            <button type="submit" className="btn-ghost">
              取消
            </button>
          </form>
        )}
        {isTerminalJobStatus(job.status) && (
          <>
            <form action={actionRetryJob}>
              <input type="hidden" name="jobId" value={job.id} />
              <button type="submit" className="btn-ink">
                手动重试（新任务）
              </button>
            </form>
            <form action={actionDeleteJob}>
              <input type="hidden" name="jobId" value={job.id} />
              <ConfirmSubmitButton
                message={`确认永久删除任务 #${job.id} 及其条目、尝试、事件和操作回执？已入库作品不会被删除。`}
                className="btn-ghost text-[#9F2F2D]"
              >
                删除任务记录
              </ConfirmSubmitButton>
            </form>
          </>
        )}
        <Link href="/admin/crawler/jobs" className="btn-ghost">
          返回列表
        </Link>
      </div>
      {isTerminalJobStatus(job.status) && (
        <p className="font-meta text-[12px] text-[#787774]">
          删除仅移除控制面任务、条目、尝试、事件和操作回执，不会删除已写入的动漫或里番作品。
        </p>
      )}

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
          {(attempt.errorCode || attempt.errorMessage) && (
            <p className="font-mono text-[11px] text-[#C5221F] break-all">
              {attempt.errorCode ? `${attempt.errorCode}: ` : ''}
              {attempt.errorMessage}
            </p>
          )}
        </section>
      )}

      <section className="surface-card p-5 space-y-2">
        <h2 className="font-ui text-sm font-semibold">条目 ({items.length})</h2>
        {items.length === 0 ? (
          <p className="font-meta text-[12px] text-[#787774]">无条目</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="font-meta text-[12px] space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={it.status} />
                  <span className="font-mono">
                    {it.source}:{it.sourceId}
                  </span>
                  {it.animeId != null && (
                    <span className="text-[#787774]">anime/work #{it.animeId}</span>
                  )}
                </div>
                {(it.errorCode || it.errorMessage) && (
                  <p className="font-mono text-[11px] text-[#C5221F] break-all pl-1">
                    {it.errorCode ? `${it.errorCode}: ` : ''}
                    {it.errorMessage}
                  </p>
                )}
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

    </div>
  );
}
