import Link from 'next/link';
import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { ProfileSourceFields } from '@/components/admin/crawler/profile-source-fields';
import { actionCreateProfile } from '../actions';
import { requireAdmin } from '@/lib/auth';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';

export const dynamic = 'force-dynamic';

export default async function CrawlerProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const year = new Date().getUTCFullYear();
  const service = getAdminCrawlerService();
  const profiles = await service.listProfiles();
  const rows = await Promise.all(
    profiles.map(async (profile) => {
      const versionId = profile.currentVersionId ?? profile.id;
      try {
        const version = await service.getProfileVersion(versionId);
        return {
          id: profile.id,
          name: profile.name,
          isEnabled: profile.isEnabled,
          versionId,
          requiredSource: version?.config?.requiredSource,
          baseUrl: version?.config?.source?.baseUrl,
          typeIds: version?.config?.source?.typeIds
            ? [...version.config.source.typeIds]
            : undefined,
        };
      } catch {
        return {
          id: profile.id,
          name: profile.name,
          isEnabled: profile.isEnabled,
          versionId,
        };
      }
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Profiles</p>
        <h1 className="font-serif text-3xl">爬虫模板</h1>
        <p className="mt-2 font-ui text-sm text-[#787774]">
          用表单配置采集参数，保存后生成版本快照。支持 MacCMS 动漫源与 Hanime。
        </p>
      </div>
      <CrawlerNav current="/admin/crawler/profiles" />
      {sp.ok === '1' && <p className="font-meta text-[13px] text-[#137333]">模板已保存</p>}
      {sp.ok === 'import' && (
        <p className="font-meta text-[13px] text-[#137333]">YAML 导入成功</p>
      )}
      {sp.error && (
        <p className="font-meta text-[13px] text-[#C5221F]">
          保存失败，请检查 URL、年份月份等必填项
        </p>
      )}

      <section className="surface-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-ui text-sm font-semibold">已有模板（{rows.length}）</h2>
          <Link href="/admin/crawler/jobs" className="font-ui text-[13px] underline">
            去启动任务 →
          </Link>
        </div>
        {rows.length === 0 ? (
          <p className="font-ui text-sm text-[#787774]">
            尚无模板。可使用下方表单创建，或运行{' '}
            <code className="font-mono text-[12px]">npm run seed:maccms-profiles</code>。
          </p>
        ) : (
          <ul className="divide-y divide-[#EAEAEA] border border-[#EAEAEA] rounded-lg overflow-hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white"
              >
                <div className="min-w-0">
                  <p className="font-ui text-sm font-medium text-[#111] truncate">{row.name}</p>
                  <p className="font-meta text-[12px] text-[#787774] mt-0.5 break-all">
                    #{row.id}
                    {row.requiredSource ? ` · source=${row.requiredSource}` : ''}
                    {row.baseUrl ? ` · ${row.baseUrl}` : ''}
                    {row.typeIds?.length ? ` · t=${row.typeIds.join(',')}` : ''}
                    {!row.isEnabled ? ' · 已禁用' : ''}
                  </p>
                </div>
                <Link
                  href="/admin/crawler/jobs"
                  className="font-ui text-[12px] text-[#0B57D0] underline shrink-0"
                >
                  启动
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={actionCreateProfile} className="surface-card p-5 space-y-6">
        <h2 className="font-ui text-sm font-semibold">新建模板</h2>
        <ProfileSourceFields defaultYear={year} />

        <section className="space-y-3">
          <h2 className="font-ui text-sm font-semibold">质量与跳过</h2>
          <label className="block font-meta text-[12px]">
            质量优先级（逗号分隔）
            <input name="qualityPriority" className="admin-input mt-1" defaultValue="1080,720,480" />
          </label>
          <label className="block font-meta text-[12px]">
            跳过关键词（逗号分隔）
            <input
              name="skipKeywords"
              className="admin-input mt-1"
              defaultValue="中字後補,简中补字,Chinese Sub,中文字幕後補"
            />
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="font-ui text-sm font-semibold">并发与策略</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block font-meta text-[12px]">
              下载并发（线程）
              <input
                name="downloadConcurrency"
                type="number"
                min={1}
                max={32}
                defaultValue={2}
                className="admin-input mt-1"
              />
            </label>
            <label className="block font-meta text-[12px]">
              解析并发（线程）
              <input
                name="parseConcurrency"
                type="number"
                min={1}
                max={32}
                defaultValue={2}
                className="admin-input mt-1"
              />
            </label>
            <label className="block font-meta text-[12px]">
              翻页并发（线程）
              <input
                name="pageConcurrency"
                type="number"
                min={1}
                max={16}
                defaultValue={2}
                className="admin-input mt-1"
              />
            </label>
            <label className="block font-meta text-[12px]">
              模板最大活动任务
              <input
                name="maxActiveJobs"
                type="number"
                min={1}
                max={16}
                defaultValue={1}
                className="admin-input mt-1"
              />
            </label>
          </div>
          <p className="font-meta text-[11px] text-[#787774]">
            MacCMS 外链主要使用「翻页并发」并行拉列表页；Hanime 下载/解析并发用于媒体上传流水线。
          </p>
          <label className="inline-flex items-center gap-2 font-ui text-sm">
            <input type="checkbox" name="continueOnError" value="1" defaultChecked />
            遇错继续（部分成功）
          </label>
          <label className="block font-meta text-[12px]">
            媒体存储模式
            <select name="storageDriver" className="admin-input mt-1" defaultValue="external">
              <option value="external">外链（MacCMS 动漫 / 仅 URL）</option>
              <option value="s3">S3 对象存储（Hanime 下载上传）</option>
              <option value="sftp">SFTP（Hanime 下载上传）</option>
            </select>
          </label>
          <p className="font-meta text-[12px] text-[#787774]">
            MacCMS 选「外链」。Hanime 须选 S3 或 SFTP，并先在{' '}
            <Link href="/admin/crawler/storage" className="underline text-[#111]">
              存储
            </Link>{' '}
            创建并激活对应配置；启动任务时会自动绑定已激活版本。
          </p>
        </section>

        <button type="submit" className="btn-ink">
          保存模板
        </button>
      </form>
    </div>
  );
}
