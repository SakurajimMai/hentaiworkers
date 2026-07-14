import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import {
  actionActivateStorage,
  actionCreateStorage,
  actionMarkStorageTestPassed,
  actionStartStorageTest,
} from '../actions';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerStoragePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Storage</p>
        <h1 className="font-serif text-3xl">存储配置</h1>
        <p className="mt-2 font-ui text-sm text-[#787774] max-w-2xl leading-relaxed">
          <strong>可选</strong>：仅当 Worker 需要把封面/视频等对象上传到对象存储时才配置。
          若采集结果只写入外链 URL（不落盘上传），可跳过本页，无需真实 S3。
          需要上传时再填 S3 兼容或 SFTP，并在激活前跑 storage_test。
        </p>
      </div>
      <CrawlerNav current="/admin/crawler/storage" />
      {sp.ok && <p className="font-meta text-[13px] text-[#137333]">ok: {sp.ok}</p>}
      {sp.error && <p className="font-meta text-[13px] text-[#C5221F]">error: {sp.error}</p>}

      <form action={actionCreateStorage} className="surface-card p-5 space-y-4">
        <h2 className="font-ui text-sm font-semibold">新建存储草稿</h2>
        <label className="block font-meta text-[12px]">
          名称 *
          <input name="name" required className="admin-input mt-1" placeholder="生产 CDN" />
        </label>
        <label className="block font-meta text-[12px]">
          驱动
          <select name="driver" className="admin-input mt-1" defaultValue="s3">
            <option value="s3">S3 兼容</option>
            <option value="sftp">SFTP</option>
          </select>
        </label>

        <div className="grid sm:grid-cols-2 gap-3 border-t border-[#EAEAEA] pt-4">
          <p className="sm:col-span-2 font-ui text-sm font-medium">S3 字段（驱动为 S3 时填写）</p>
          <label className="block font-meta text-[12px]">
            Endpoint
            <input name="endpoint" className="admin-input mt-1" placeholder="https://s3.example.com" />
          </label>
          <label className="block font-meta text-[12px]">
            Region
            <input name="region" className="admin-input mt-1" defaultValue="auto" />
          </label>
          <label className="block font-meta text-[12px]">
            Bucket
            <input name="bucket" className="admin-input mt-1" />
          </label>
          <label className="block font-meta text-[12px]">
            Prefix
            <input name="prefix" className="admin-input mt-1" placeholder="anime/" />
          </label>
          <label className="block font-meta text-[12px]">
            分发模式
            <select name="deliveryMode" className="admin-input mt-1" defaultValue="public">
              <option value="public">public</option>
              <option value="cdn">cdn</option>
              <option value="private">private</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 font-ui text-sm self-end pb-2">
            <input type="checkbox" name="forcePathStyle" value="1" defaultChecked />
            forcePathStyle
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 border-t border-[#EAEAEA] pt-4">
          <p className="sm:col-span-2 font-ui text-sm font-medium">SFTP 字段（驱动为 SFTP 时填写）</p>
          <label className="block font-meta text-[12px]">
            Host
            <input name="host" className="admin-input mt-1" />
          </label>
          <label className="block font-meta text-[12px]">
            Port
            <input name="port" type="number" className="admin-input mt-1" defaultValue={22} />
          </label>
          <label className="block font-meta text-[12px]">
            Username
            <input name="username" className="admin-input mt-1" />
          </label>
          <label className="block font-meta text-[12px]">
            Root path
            <input name="rootPath" className="admin-input mt-1" placeholder="/data/media" />
          </label>
          <label className="block font-meta text-[12px] sm:col-span-2">
            Host key fingerprint（≥16 字符）
            <input name="hostKeyFingerprint" className="admin-input mt-1" placeholder="sha256:..." />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 border-t border-[#EAEAEA] pt-4">
          <label className="block font-meta text-[12px]">
            公开 Base URL（可选）
            <input name="publicBaseUrl" type="url" className="admin-input mt-1" placeholder="https://cdn.example.com" />
          </label>
          <label className="inline-flex items-center gap-2 font-ui text-sm self-end pb-2">
            <input type="checkbox" name="organizeByDate" value="1" defaultChecked />
            按日期组织路径
          </label>
        </div>

        <button type="submit" className="btn-ink">
          保存草稿
        </button>
      </form>

      <div className="grid sm:grid-cols-3 gap-3">
        <form action={actionStartStorageTest} className="surface-card p-4 space-y-2">
          <h3 className="font-ui text-sm font-semibold">发起 storage_test</h3>
          <input name="profileId" placeholder="profileId" defaultValue="1" className="admin-input" />
          <input name="storageProfileVersionId" placeholder="versionId" defaultValue="1" className="admin-input" />
          <input type="hidden" name="configSnapshotJson" value="{}" />
          <button type="submit" className="btn-ghost w-full">
            启动测试任务
          </button>
        </form>
        <form action={actionMarkStorageTestPassed} className="surface-card p-4 space-y-2">
          <h3 className="font-ui text-sm font-semibold">紧急标记通过</h3>
          <input name="versionId" placeholder="versionId" defaultValue="1" className="admin-input" />
          <label className="flex items-center gap-2 font-meta text-[11px]">
            <input type="checkbox" name="allowBreakGlass" value="1" />
            break-glass
          </label>
          <button type="submit" className="btn-ghost w-full">
            标记
          </button>
        </form>
        <form action={actionActivateStorage} className="surface-card p-4 space-y-2">
          <h3 className="font-ui text-sm font-semibold">激活版本</h3>
          <input name="versionId" placeholder="versionId" defaultValue="1" className="admin-input" />
          <button type="submit" className="btn-ink w-full">
            激活
          </button>
        </form>
      </div>
    </div>
  );
}
