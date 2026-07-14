import Link from 'next/link';
import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { actionConfirmYamlImport } from '../actions';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Advanced</p>
        <h1 className="font-serif text-3xl">旧配置导入（高级）</h1>
        <p className="mt-2 font-ui text-sm text-[#787774] max-w-2xl">
          日常请使用「模板 / 存储 / 调度」页面的<strong>表单</strong>配置。本页仅用于迁移历史
          production_config.yml，不是常规操作入口。
        </p>
      </div>
      <CrawlerNav current="/admin/crawler/import" />
      {sp.error && (
        <p className="font-meta text-[13px] text-[#C5221F]">
          导入失败（校验未通过）
        </p>
      )}

      <div className="surface-card p-5 space-y-3">
        <p className="font-ui text-sm">
          推荐流程：
          <Link href="/admin/crawler/profiles" className="underline mx-1">
            模板表单
          </Link>
          →
          <Link href="/admin/crawler/storage" className="underline mx-1">
            存储表单
          </Link>
          →
          <Link href="/admin/crawler/jobs" className="underline mx-1">
            启动任务
          </Link>
        </p>
      </div>

      <details className="surface-card p-5">
        <summary className="font-ui text-sm font-semibold cursor-pointer">
          展开：从旧 YAML 导入模板
        </summary>
        <form action={actionConfirmYamlImport} className="mt-4 space-y-3">
          <label className="block font-meta text-[12px]">
            模板名称
            <input name="name" defaultValue="imported-profile" className="admin-input mt-1" />
          </label>
          <label className="block font-meta text-[12px]">
            粘贴 production_config.yml 内容
            <textarea
              name="rawYaml"
              rows={14}
              className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-mono text-[12px]"
              placeholder="crawl:&#10;  base_url: ..."
            />
          </label>
          <button type="submit" className="btn-ghost">
            导入为模板
          </button>
        </form>
      </details>
    </div>
  );
}
