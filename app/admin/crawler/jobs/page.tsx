import Link from 'next/link';
import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { StatusBadge } from '@/components/admin/crawler/status-badge';
import { actionStartManualJob } from '../actions';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const jobs = await getAdminCrawlerService().listJobs(100);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Jobs</p>
        <h1 className="font-serif text-3xl">任务列表</h1>
      </div>
      <CrawlerNav current="/admin/crawler/jobs" />
      {sp.error && (
        <p className="font-meta text-[13px] text-[#C5221F]">操作失败：{sp.error}</p>
      )}

      <form action={actionStartManualJob} className="surface-card p-5 space-y-3">
        <h2 className="font-ui text-sm font-semibold">手动启动</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block font-meta text-[12px]">
            Profile ID
            <input name="profileId" defaultValue="1" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
          </label>
          <label className="block font-meta text-[12px]">
            Profile Version ID
            <input name="profileVersionId" defaultValue="1" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
          </label>
        </div>
        <p className="font-meta text-[12px] text-[#787774]">
          使用已保存模板的版本号启动；快照由模板表单生成，无需手写 JSON。
        </p>
        <input
          type="hidden"
          name="configSnapshotJson"
          value={JSON.stringify({
            schemaVersion: 1,
            requiredSource: 'hanime',
            storageDriver: 's3',
            source: { baseUrl: 'https://hanime1.me' },
            dateFilter: { years: [new Date().getUTCFullYear()], months: [1] },
            qualityPriority: ['1080', '720'],
            concurrency: { download: 2, parse: 2 },
            continueOnError: true,
            maxActiveJobs: 1,
          })}
        />
        <input type="hidden" name="kind" value="crawl" />
        <button type="submit" className="btn-ink">
          立即入队
        </button>
      </form>

      <ul className="space-y-2">
        {jobs.map((j) => (
          <li key={j.id} className="surface-card p-4 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm">#{j.id}</span>
              <StatusBadge status={j.status} />
              <span className="font-meta text-[12px]">{j.kind}</span>
              <span className="font-meta text-[12px] text-[#787774]">{j.createdAt}</span>
            </div>
            <Link href={`/admin/crawler/jobs/${j.id}`} className="font-ui text-[13px] underline">
              详情
            </Link>
          </li>
        ))}
        {jobs.length === 0 && (
          <p className="font-meta text-[13px] text-[#787774]">暂无任务</p>
        )}
      </ul>
    </div>
  );
}
