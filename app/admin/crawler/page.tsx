import Link from 'next/link';
import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { StatusBadge } from '@/components/admin/crawler/status-badge';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string }>;
}) {
  await requireAdmin();
  const dash = await getAdminCrawlerService().getDashboard();
  const params = (await searchParams) ?? {};
  const externalNotice = params.notice === 'external-storage';

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Crawler</p>
        <h1 className="font-serif text-3xl">爬虫管理</h1>
        <p className="mt-2 font-ui text-sm text-[#787774] max-w-2xl leading-relaxed">
          主程序（Next.js）负责配置与任务；Python 采集以<strong>同仓库组件</strong>
          <code className="mx-1 font-mono text-[12px]">crawler_worker</code>
          运行（开发可本机启动，生产可用 Compose 同栈部署）。默认模式只保存来源外链，
          不需要独立对象存储/密钥库。
        </p>
      </div>
      <CrawlerNav current="/admin/crawler" />
      {externalNotice ? (
        <p className="surface-card p-4 font-ui text-sm text-[#444]">
          MacCMS 外链采集不需要对象存储。Hanime 下载上传请到{' '}
          <Link href="/admin/crawler/storage" className="underline text-[#111]">
            爬虫 → 存储
          </Link>{' '}
          配置并激活 S3/SFTP。
        </p>
      ) : null}

      <section className="surface-card p-5 space-y-3">
        <h2 className="font-ui text-sm font-semibold">推荐操作路径</h2>
        <ol className="list-decimal list-inside font-ui text-sm text-[#444] space-y-1">
          <li>
            <Link href="/admin/crawler/profiles" className="underline">
              模板
            </Link>
            ：填写来源、日期、质量等表单
          </li>
          <li>
            <Link href="/admin/crawler/jobs" className="underline">
              任务
            </Link>
            ：手动入队并查看进度（仅写外链 URL 时<strong>不需要</strong>真实 S3）
          </li>
          <li>
            <Link href="/admin/crawler/workers" className="underline">
              Worker
            </Link>
            ：创建节点并复制一次性机器令牌
          </li>
          <li>
            <Link href="/admin/crawler/storage" className="underline">
              存储
            </Link>
            ：Hanime 必配 S3/SFTP；MacCMS 外链可跳过
          </li>
          <li>
            （可选）
            <Link href="/admin/crawler/schedules" className="underline">
              调度
            </Link>
            ：配置定时执行
          </li>
        </ol>
        <p className="font-meta text-[12px] text-[#787774]">
          本机启动采集组件示例：
          <code className="block mt-1 font-mono text-[11px] bg-[#F7F6F3] p-2 rounded overflow-x-auto">
            set CRAWLER_CONTROL_URL=http://127.0.0.1:3000/api/internal/crawler/v1{'\n'}
            set CRAWLER_WORKER_ID=1{'\n'}
            set CRAWLER_WORKER_TOKEN=&lt;后台签发的机器令牌&gt;{'\n'}
            python -m crawler_worker.main
          </code>
        </p>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="surface-card p-5">
          <p className="font-meta mb-2">Worker 在线</p>
          <p className="font-ui text-2xl font-semibold tabular">
            {dash.workersOnline}/{dash.workersTotal}
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="font-meta mb-2">运行中</p>
          <p className="font-ui text-2xl font-semibold tabular">
            {(dash.jobsByStatus.running ?? 0) + (dash.jobsByStatus.leased ?? 0)}
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="font-meta mb-2">成功 / 部分</p>
          <p className="font-ui text-2xl font-semibold tabular">
            {dash.jobsByStatus.succeeded ?? 0}/{dash.jobsByStatus.partial_succeeded ?? 0}
          </p>
        </div>
        <div className="surface-card p-5">
          <p className="font-meta mb-2">失败</p>
          <p className="font-ui text-2xl font-semibold tabular">
            {dash.jobsByStatus.failed ?? 0}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-ui text-sm font-semibold">活动任务</h2>
          <Link href="/admin/crawler/jobs" className="font-ui text-[13px] underline">
            全部
          </Link>
        </div>
        {dash.activeJobs.length === 0 ? (
          <p className="font-meta text-[13px] text-[#787774]">暂无活动任务</p>
        ) : (
          <ul className="space-y-2">
            {dash.activeJobs.map((j) => (
              <li key={j.id} className="surface-card p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[13px]">#{j.id}</span>
                  <StatusBadge status={j.status} />
                  <span className="font-meta text-[12px]">{j.kind}</span>
                </div>
                <Link
                  href={`/admin/crawler/jobs/${j.id}`}
                  className="font-ui text-[13px] underline"
                >
                  详情
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dash.overdueSchedules.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-ui text-sm font-semibold">逾期待领取调度</h2>
          <ul className="space-y-2">
            {dash.overdueSchedules.map((s) => (
              <li key={s.scheduleId} className="surface-card p-4 font-meta text-[12px]">
                #{s.scheduleId} {s.name} · {s.nextRunAt} · 逾期点 {s.overduePoints}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
