import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { actionCreateProfile } from '../actions';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const year = new Date().getUTCFullYear();

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Profiles</p>
        <h1 className="font-serif text-3xl">爬虫模板</h1>
        <p className="mt-2 font-ui text-sm text-[#787774]">
          用表单配置采集参数，保存后生成版本快照。无需手写 JSON / YAML。
        </p>
      </div>
      <CrawlerNav current="/admin/crawler/profiles" />
      {sp.ok && <p className="font-meta text-[13px] text-[#137333]">模板已保存</p>}
      {sp.error && (
        <p className="font-meta text-[13px] text-[#C5221F]">
          保存失败，请检查 URL、年份月份等必填项
        </p>
      )}

      <form action={actionCreateProfile} className="surface-card p-5 space-y-6">
        <section className="space-y-3">
          <h2 className="font-ui text-sm font-semibold">基本</h2>
          <label className="block font-meta text-[12px]">
            模板名称 *
            <input name="name" required className="admin-input mt-1" placeholder="例如：每月汉化" />
          </label>
          <label className="block font-meta text-[12px]">
            来源适配器
            <select name="requiredSource" className="admin-input mt-1" defaultValue="hanime">
              <option value="hanime">hanime</option>
              <option value="getchu">getchu</option>
            </select>
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="font-ui text-sm font-semibold">来源</h2>
          <label className="block font-meta text-[12px]">
            站点 Base URL *
            <input
              name="baseUrl"
              type="url"
              required
              className="admin-input mt-1"
              defaultValue="https://hanime1.me"
              placeholder="https://hanime1.me"
            />
          </label>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block font-meta text-[12px]">
              Genre（可选）
              <input name="genre" className="admin-input mt-1" placeholder="URL 编码或路径" />
            </label>
            <label className="block font-meta text-[12px]">
              Sort（可选）
              <input name="sort" className="admin-input mt-1" />
            </label>
            <label className="block font-meta text-[12px]">
              Type（可选）
              <input name="type" className="admin-input mt-1" />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-ui text-sm font-semibold">日期过滤</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block font-meta text-[12px]">
              年份（逗号分隔）*
              <input name="years" className="admin-input mt-1" defaultValue={String(year)} required />
            </label>
            <label className="block font-meta text-[12px]">
              月份 1–12（逗号分隔）*
              <input
                name="months"
                className="admin-input mt-1"
                defaultValue="1,2,3,4,5,6,7,8,9,10,11,12"
                required
              />
            </label>
          </div>
        </section>

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
              placeholder="中字後補,简中补字"
            />
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="font-ui text-sm font-semibold">并发与策略</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block font-meta text-[12px]">
              下载并发
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
              解析并发
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
          <label className="inline-flex items-center gap-2 font-ui text-sm">
            <input type="checkbox" name="continueOnError" value="1" defaultChecked />
            遇错继续（部分成功）
          </label>
          <label className="block font-meta text-[12px]">
            媒体驱动偏好
            <select name="storageDriver" className="admin-input mt-1" defaultValue="s3">
              <option value="s3">S3</option>
              <option value="sftp">SFTP</option>
            </select>
          </label>
        </section>

        <button type="submit" className="btn-ink">
          保存模板
        </button>
      </form>
    </div>
  );
}
