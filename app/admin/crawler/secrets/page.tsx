import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { SecretEye } from '@/components/admin/crawler/secret-eye';
import { actionCreateSecret } from '../actions';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerSecretsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const secrets = await getAdminCrawlerService().listSecrets();

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Secrets</p>
        <h1 className="font-serif text-3xl">密钥</h1>
      </div>
      <CrawlerNav current="/admin/crawler/secrets" />
      {sp.ok && <p className="font-meta text-[13px] text-[#137333]">已创建</p>}
      {sp.error && <p className="font-meta text-[13px] text-[#C5221F]">创建失败</p>}

      <form action={actionCreateSecret} className="surface-card p-5 space-y-3">
        <h2 className="font-ui text-sm font-semibold">新建密钥</h2>
        <label className="block font-meta text-[12px]">
          名称
          <input name="name" required className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
        </label>
        <label className="block font-meta text-[12px]">
          范围 scope
          <input name="scope" required placeholder="network.proxy" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
        </label>
        <label className="block font-meta text-[12px]">
          明文
          <input name="plaintext" required type="password" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
        </label>
        <button type="submit" className="btn-ink">
          加密保存
        </button>
      </form>

      <ul className="space-y-2">
        {secrets.map((s) => (
          <li key={s.id} className="surface-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-ui text-sm">
                #{s.id} {s.name}
              </p>
              <p className="font-meta text-[12px] text-[#787774]">
                {s.scope} · v{s.currentVersion ?? '—'} · {s.isRevoked ? 'revoked' : 'active'} ·{' '}
                {s.maskedValue}
              </p>
            </div>
            {!s.isRevoked && <SecretEye secretId={s.id} />}
          </li>
        ))}
        {secrets.length === 0 && (
          <p className="font-meta text-[13px] text-[#787774]">暂无密钥</p>
        )}
      </ul>
      <p className="font-meta text-[12px] text-[#787774]">
        眼睛图标直接揭示明文，无需二次验证；30 秒后自动隐藏；响应 no-store。
      </p>
    </div>
  );
}
