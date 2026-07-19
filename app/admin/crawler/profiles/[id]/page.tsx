import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { CrawlerProfileForm } from '@/components/admin/crawler/profile-form';
import { requireAdmin } from '@/lib/auth';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { actionUpdateProfile } from '../../actions';
import { profileFormDefaults } from '../../form-config';

export const dynamic = 'force-dynamic';

export default async function CrawlerProfileEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const service = getAdminCrawlerService();
  const profile = await service.getProfile(id);
  if (!profile?.isEnabled || !profile.currentVersionId) notFound();
  const version = await service.getProfileVersion(profile.currentVersionId);
  if (!version) notFound();
  const sp = await searchParams;
  const defaults = profileFormDefaults(profile.name, version.config);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Profiles / #{profile.id}</p>
        <h1 className="font-serif text-3xl">编辑爬虫模板</h1>
        <p className="mt-2 font-ui text-sm text-[#787774]">
          保存会更新当前模板；已有任务继续保留原配置快照。
        </p>
      </div>
      <CrawlerNav current="/admin/crawler/profiles" />
      <Link
        href="/admin/crawler/profiles"
        className="inline-block font-ui text-[13px] underline"
      >
        ← 返回模板列表
      </Link>
      {sp.error ? (
        <p className="font-meta text-[13px] text-[#C5221F]">
          保存失败，请检查 URL、年份月份等必填项
        </p>
      ) : null}
      <CrawlerProfileForm
        action={actionUpdateProfile}
        defaults={defaults}
        profileId={profile.id}
        heading="模板配置"
        submitLabel="保存修改"
      />
    </div>
  );
}
