import Link from 'next/link';
import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { StatusBadge } from '@/components/admin/crawler/status-badge';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import {
  actionDeleteJob,
  actionPurgeJobs,
  actionStartManualJob,
} from '../actions';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { isTerminalJobStatus } from '@/lib/server/crawler/domain/job';
import {
  resolveCrawlerIngestionMode,
  type CrawlerIngestionMode,
} from '@/lib/server/crawler/domain/config';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function ingestionModeFromSnapshot(configSnapshotJson: string): CrawlerIngestionMode {
  try {
    const parsed = JSON.parse(configSnapshotJson) as {
      requiredSource?: unknown;
      ingestionMode?: unknown;
    };
    return resolveCrawlerIngestionMode({
      requiredSource:
        typeof parsed.requiredSource === 'string' ? parsed.requiredSource : undefined,
      ingestionMode:
        parsed.ingestionMode === 'full' || parsed.ingestionMode === 'playback_only'
          ? parsed.ingestionMode
          : undefined,
    });
  } catch {
    return 'full';
  }
}

function ingestionModeLabel(mode: CrawlerIngestionMode): string {
  return mode === 'playback_only' ? '仅线路' : '主资料';
}

export default async function CrawlerJobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    ok?: string;
    n?: string;
    truncated?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const service = getAdminCrawlerService();
  const [jobs, profiles] = await Promise.all([
    service.listJobs(100),
    service.listProfiles(),
  ]);
  const runnableProfiles = (
    await Promise.all(
      profiles
        .filter((profile) => profile.isEnabled && profile.currentVersionId != null)
        .map(async (profile) => {
          const versionId = profile.currentVersionId!;
          try {
            const version = await service.getProfileVersion(versionId);
            const source = version?.config?.requiredSource;
            return {
              id: profile.id,
              name: profile.name,
              versionId,
              requiredSource: source,
              ingestionMode: version
                ? resolveCrawlerIngestionMode(version.config)
                : 'full' as const,
            };
          } catch {
            return {
              id: profile.id,
              name: profile.name,
              versionId,
              requiredSource: undefined as string | undefined,
              ingestionMode: 'full' as const,
            };
          }
        }),
    )
  ).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  const terminalCount = jobs.filter((j) => isTerminalJobStatus(j.status)).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Jobs</p>
        <h1 className="font-serif text-3xl">任务列表</h1>
        <p className="mt-2 font-ui text-sm text-[#787774] max-w-2xl">
          成功/失败/取消等终态任务可手动删除；也可按自定义保留天数批量清理历史记录（不删除已入库作品）。
        </p>
      </div>
      <CrawlerNav current="/admin/crawler/jobs" />
      {sp.ok === 'deleted' && (
        <p className="font-meta text-[13px] text-[#137333]">任务已删除</p>
      )}
      {sp.ok === 'purged' && sp.truncated !== '1' && (
        <p className="font-meta text-[13px] text-[#137333]">
          已清理 {sp.n ?? '0'} 条历史任务
        </p>
      )}
      {sp.ok === 'purged' && sp.truncated === '1' && (
        <p className="font-meta text-[13px] text-[#9F5B00]">
          本次已清理 {sp.n ?? '0'} 条，达到单次安全上限；仍可能存在符合条件的任务，请再次清理。
        </p>
      )}
      {sp.error && (
        <p className="font-meta text-[13px] text-[#C5221F]">
          操作失败：
          {sp.error === 'delete_active'
            ? '运行中/排队中的任务请先取消，再删除'
            : sp.error === 'purge'
              ? '批量清理失败（检查保留天数 1–3650）'
              : sp.error}
        </p>
      )}

      <section className="surface-card p-5 space-y-3">
        <h2 className="font-ui text-sm font-semibold">手动启动</h2>
        {runnableProfiles.length === 0 ? (
          <p className="font-ui text-sm text-[#787774]">
            尚无可用模板。请先前往{' '}
            <Link href="/admin/crawler/profiles" className="underline text-[#111]">
              模板
            </Link>{' '}
            保存采集来源与日期范围。
          </p>
        ) : (
          <form action={actionStartManualJob} className="flex flex-col sm:flex-row gap-3">
            <label className="flex-1 font-meta text-[12px]">
              采集模板
              <select name="profileVersionId" required className="admin-input mt-1">
                {runnableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.versionId}>
                    {profile.name}
                    {profile.requiredSource ? ` · ${profile.requiredSource}` : ''}（#{profile.id}）
                    {' · '}{ingestionModeLabel(profile.ingestionMode)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn-ink self-end">
              立即入队
            </button>
          </form>
        )}
        <p className="font-meta text-[12px] text-[#787774]">
          任务会复制所选模板的当前版本；后续修改模板不会改变已入队任务。
          Worker 须上报对应 source 能力才能 claim（如 ikun / wujin）。
        </p>
      </section>

      <section className="surface-card p-5 space-y-3">
        <h2 className="font-ui text-sm font-semibold">历史清理（自定义保留时间）</h2>
        <p className="font-ui text-sm text-[#787774]">
          当前页面展示的最近 100 条中有 {terminalCount} 条终态任务。清理只删控制面记录（jobs /
          items / attempts / events / operation receipts），不会删除 `anime_works` 或里番片库。
        </p>
        <form action={actionPurgeJobs} className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
          <label className="font-meta text-[12px]">
            删除早于
            <div className="mt-1 flex items-center gap-2">
              <input
                name="olderThanDays"
                type="number"
                min={1}
                max={3650}
                defaultValue={30}
                required
                className="admin-input w-24"
              />
              <span className="text-[#787774]">天 的任务</span>
            </div>
          </label>
          <label className="font-meta text-[12px]">
            范围
            <select name="scope" className="admin-input mt-1 min-w-[10rem]">
              <option value="all">全部终态</option>
              <option value="failed">仅失败</option>
              <option value="success">仅成功/部分成功</option>
              <option value="cancelled">仅取消</option>
            </select>
          </label>
          <ConfirmSubmitButton
            message="确认按当前天数与范围永久删除历史任务记录？已入库作品不会被删除。"
            className="btn-ghost text-[#9F2F2D]"
          >
            按条件清理
          </ConfirmSubmitButton>
        </form>
        <p className="font-meta text-[11px] text-[#787774]">
          示例：填 7 +「仅失败」= 删除 7 天前结束的失败任务；填 90 +「全部终态」= 保留近 90 天历史。
        </p>
      </section>

      <ul className="divide-y divide-[#EAEAEA] border-y border-[#EAEAEA] bg-white">
        {jobs.map((job) => {
          const canDelete = isTerminalJobStatus(job.status);
          const ingestionMode = job.kind === 'crawl'
            ? ingestionModeFromSnapshot(job.configSnapshotJson)
            : null;
          return (
            <li
              key={job.id}
              className="py-4 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm">#{job.id}</span>
                <StatusBadge status={job.status} />
                <span className="font-meta text-[12px]">{job.kind}</span>
                {ingestionMode ? (
                  <span className="font-meta text-[12px] text-[#787774]">
                    {ingestionModeLabel(ingestionMode)}
                  </span>
                ) : null}
                <span className="font-meta text-[12px] text-[#787774]">{job.createdAt}</span>
                {job.finishedAt && (
                  <span className="font-meta text-[12px] text-[#787774]">
                    结束 {job.finishedAt}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/admin/crawler/jobs/${job.id}`}
                  className="font-ui text-[13px] underline"
                >
                  详情
                </Link>
                {canDelete ? (
                  <form action={actionDeleteJob}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <ConfirmSubmitButton
                      message={`确认永久删除任务 #${job.id} 及其条目、尝试、事件和操作回执？已入库作品不会被删除。`}
                      className="font-ui text-[13px] text-[#9F2F2D] underline"
                    >
                      删除
                    </ConfirmSubmitButton>
                  </form>
                ) : (
                  <span className="font-meta text-[11px] text-[#787774]">运行中不可删</span>
                )}
              </div>
            </li>
          );
        })}
        {jobs.length === 0 && (
          <li className="py-8 px-4 font-meta text-[13px] text-[#787774]">暂无任务</li>
        )}
      </ul>
    </div>
  );
}
