import Link from 'next/link';
import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { CrawlerProfileForm } from '@/components/admin/crawler/profile-form';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { actionCreateProfile, actionDeleteProfile } from '../actions';
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
          用表单配置采集参数；任务启动时会固化配置快照。支持 MacCMS 动漫源与 Hanime。
        </p>
      </div>
      <CrawlerNav current="/admin/crawler/profiles" />
      {sp.ok === '1' && <p className="font-meta text-[13px] text-[#137333]">模板已保存</p>}
      {sp.ok === 'updated' && (
        <p className="font-meta text-[13px] text-[#137333]">模板已更新并生成新版本</p>
      )}
      {sp.ok === 'deleted' && (
        <p className="font-meta text-[13px] text-[#137333]">模板已移除，关联定时任务已停用</p>
      )}
      {sp.ok === 'import' && (
        <p className="font-meta text-[13px] text-[#137333]">YAML 导入成功</p>
      )}
      {sp.error === 'delete' && (
        <p className="font-meta text-[13px] text-[#C5221F]">删除模板失败</p>
      )}
      {sp.error && sp.error !== 'delete' && (
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
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <Link
                    href="/admin/crawler/jobs"
                    className="font-ui text-[12px] text-[#0B57D0] underline"
                  >
                    启动
                  </Link>
                  <Link
                    href={`/admin/crawler/profiles/${row.id}`}
                    className="font-ui text-[12px] text-[#0B57D0] underline"
                  >
                    编辑
                  </Link>
                  <form action={actionDeleteProfile}>
                    <input type="hidden" name="profileId" value={row.id} />
                    <ConfirmSubmitButton
                      message="模板将从可用列表移除，关联定时任务将停用，历史任务不会删除。"
                      className="font-ui text-[12px] text-[#C5221F] underline"
                      title="删除模板"
                      confirmLabel="删除"
                    >
                      删除
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CrawlerProfileForm
        action={actionCreateProfile}
        heading="新建模板"
        submitLabel="保存模板"
      />
    </div>
  );
}
