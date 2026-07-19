import Link from 'next/link';
import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import {
  actionActivateStorage,
  actionCreateStorageDraft,
  actionMarkStorageTestPassed,
  actionStartStorageTest,
} from '../actions';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerStoragePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const service = getAdminCrawlerService();

  let profiles: Awaited<ReturnType<typeof service.listStorageProfiles>> = [];
  let loadError: string | null = null;
  try {
    profiles = await service.listStorageProfiles();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : '无法加载存储配置（请先执行迁移 0014-storage-profiles）';
  }

  const rows = await Promise.all(
    profiles.map(async (profile) => {
      const versions = await service.listStorageVersions(profile.id);
      return { profile, versions };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Storage</p>
        <h1 className="font-serif text-3xl">存储（S3 / SFTP）</h1>
        <p className="mt-2 font-ui text-sm text-[#787774] max-w-2xl leading-relaxed">
          Hanime 等<strong>下载上传型</strong>采集需要对象存储。MacCMS 动漫外链模式不需要。
          流程：创建草稿 →（可选）storage_test 任务 → 标记测试通过 → 激活 → 在模板里选择 s3/sftp。
        </p>
      </div>
      <CrawlerNav current="/admin/crawler/storage" />

      {sp.ok === '1' && (
        <p className="font-meta text-[13px] text-[#137333]">存储配置已保存</p>
      )}
      {sp.ok === 'activated' && (
        <p className="font-meta text-[13px] text-[#137333]">存储版本已激活</p>
      )}
      {sp.ok === 'tested' && (
        <p className="font-meta text-[13px] text-[#137333]">已标记 storage_test 通过</p>
      )}
      {sp.ok === 'job' && (
        <p className="font-meta text-[13px] text-[#137333]">storage_test 任务已入队</p>
      )}
      {sp.error && (
        <p className="font-meta text-[13px] text-[#C5221F]">操作失败：{sp.error}</p>
      )}
      {loadError && (
        <p className="surface-card p-4 font-ui text-sm text-[#9F2F2D]">
          {loadError}
          <br />
          <span className="font-meta text-[12px] text-[#787774]">
            远程库执行：`CRAWLER_MIGRATE_CONFIRM=yes npm run db:migrate:crawler`
          </span>
        </p>
      )}

      <section className="surface-card p-5 space-y-3">
        <h2 className="font-ui text-sm font-semibold">谁需要配置？</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-ui text-sm">
            <thead className="border-b border-[#EAEAEA] text-[#787774]">
              <tr>
                <th className="p-2">场景</th>
                <th className="p-2">S3/SFTP</th>
                <th className="p-2">说明</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#EAEAEA]">
                <td className="p-2">Hanime 里番</td>
                <td className="p-2 font-semibold text-[#111]">需要</td>
                <td className="p-2">模板选 s3 或 sftp，并绑定已激活的存储版本</td>
              </tr>
              <tr>
                <td className="p-2">MacCMS 动漫外链</td>
                <td className="p-2">不需要</td>
                <td className="p-2">模板保持 external，只存 m3u8/直链</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card p-5 space-y-4">
        <h2 className="font-ui text-sm font-semibold">新建 S3 配置</h2>
        <form action={actionCreateStorageDraft} className="grid sm:grid-cols-2 gap-3">
          <input type="hidden" name="driver" value="s3" />
          <label className="block font-meta text-[12px] sm:col-span-2">
            名称
            <input name="name" required className="admin-input mt-1" placeholder="prod-s3" />
          </label>
          <label className="block font-meta text-[12px]">
            Endpoint
            <input
              name="endpoint"
              required
              className="admin-input mt-1"
              placeholder="https://s3.example.com"
            />
          </label>
          <label className="block font-meta text-[12px]">
            Region
            <input name="region" required className="admin-input mt-1" defaultValue="auto" />
          </label>
          <label className="block font-meta text-[12px]">
            Bucket
            <input name="bucket" required className="admin-input mt-1" />
          </label>
          <label className="block font-meta text-[12px]">
            Prefix
            <input name="prefix" className="admin-input mt-1" placeholder="anime/" />
          </label>
          <label className="block font-meta text-[12px]">
            Public Base URL（必填）
            <input
              name="publicBaseUrl"
              required
              className="admin-input mt-1"
              placeholder="https://cdn.example.com"
            />
          </label>
          <label className="block font-meta text-[12px]">
            Delivery
            <select name="deliveryMode" className="admin-input mt-1" defaultValue="public">
              <option value="public">public</option>
              <option value="cdn">cdn</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 font-ui text-sm sm:col-span-2">
            <input type="checkbox" name="forcePathStyle" value="1" defaultChecked />
            forcePathStyle（MinIO / 兼容 S3 常用）
          </label>
          <label className="inline-flex items-center gap-2 font-ui text-sm sm:col-span-2">
            <input type="checkbox" name="organizeByDate" value="1" defaultChecked />
            按日期组织路径
          </label>
          <button type="submit" className="btn-ink sm:col-span-2 justify-self-start">
            保存 S3 草稿
          </button>
        </form>
      </section>

      <section className="surface-card p-5 space-y-4">
        <h2 className="font-ui text-sm font-semibold">新建 SFTP 配置</h2>
        <form action={actionCreateStorageDraft} className="grid sm:grid-cols-2 gap-3">
          <input type="hidden" name="driver" value="sftp" />
          <label className="block font-meta text-[12px] sm:col-span-2">
            名称
            <input name="name" required className="admin-input mt-1" placeholder="prod-sftp" />
          </label>
          <label className="block font-meta text-[12px]">
            Host
            <input name="host" required className="admin-input mt-1" />
          </label>
          <label className="block font-meta text-[12px]">
            Port
            <input name="port" type="number" defaultValue={22} className="admin-input mt-1" />
          </label>
          <label className="block font-meta text-[12px]">
            Username
            <input name="username" required className="admin-input mt-1" />
          </label>
          <label className="block font-meta text-[12px]">
            Root Path
            <input name="rootPath" required className="admin-input mt-1" placeholder="/data/media" />
          </label>
          <label className="block font-meta text-[12px] sm:col-span-2">
            Host Key Fingerprint（必填，防 MITM）
            <input
              name="hostKeyFingerprint"
              required
              minLength={16}
              className="admin-input mt-1 font-mono text-[12px]"
              placeholder="SHA256:...."
            />
          </label>
          <label className="block font-meta text-[12px] sm:col-span-2">
            Public Base URL（必填，用于拼播放地址）
            <input
              name="publicBaseUrl"
              required
              className="admin-input mt-1"
              placeholder="https://media.example.com"
            />
          </label>
          <label className="inline-flex items-center gap-2 font-ui text-sm sm:col-span-2">
            <input type="checkbox" name="organizeByDate" value="1" defaultChecked />
            按日期组织路径
          </label>
          <button type="submit" className="btn-ink sm:col-span-2 justify-self-start">
            保存 SFTP 草稿
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-ui text-sm font-semibold">已有配置</h2>
        {rows.length === 0 ? (
          <p className="font-meta text-[13px] text-[#787774]">暂无存储配置</p>
        ) : (
          <ul className="space-y-4">
            {rows.map(({ profile, versions }) => (
              <li key={profile.id} className="surface-card p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-ui text-sm font-semibold">{profile.name}</span>
                  <span className="font-mono text-[12px] uppercase">{profile.driver}</span>
                  <span className="font-meta text-[12px] text-[#787774]">
                    #{profile.id}
                    {profile.currentVersionId
                      ? ` · 已激活版本 #${profile.currentVersionId}`
                      : ' · 未激活'}
                  </span>
                </div>
                <ul className="space-y-2">
                  {versions.map((v) => (
                    <li
                      key={v.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#EAEAEA] pt-2"
                    >
                      <div className="font-meta text-[12px]">
                        版本 {v.version} · id #{v.id} ·{' '}
                        {v.storageTestPassed ? (
                          <span className="text-[#137333]">test passed</span>
                        ) : (
                          <span className="text-[#9F2F2D]">test pending</span>
                        )}
                        {profile.currentVersionId === v.id ? ' · active' : ''}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <form action={actionStartStorageTest}>
                          <input type="hidden" name="storageProfileVersionId" value={v.id} />
                          <button type="submit" className="btn-ghost text-[12px]">
                            入队 storage_test
                          </button>
                        </form>
                        {!v.storageTestPassed && (
                          <form action={actionMarkStorageTestPassed}>
                            <input type="hidden" name="versionId" value={v.id} />
                            <button type="submit" className="btn-ghost text-[12px]">
                              标记测试通过
                            </button>
                          </form>
                        )}
                        <form action={actionActivateStorage}>
                          <input type="hidden" name="versionId" value={v.id} />
                          <button
                            type="submit"
                            className="btn-ink text-[12px]"
                            disabled={!v.storageTestPassed}
                          >
                            激活
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <p className="font-meta text-[12px] text-[#787774]">
          激活后，在{' '}
          <Link href="/admin/crawler/profiles" className="underline text-[#111]">
            模板
          </Link>{' '}
          中为 Hanime 选择对应 `storageDriver`，启动任务时会自动绑定已激活版本。
        </p>
      </section>
    </div>
  );
}
