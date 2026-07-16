import { CrawlerNav } from '@/components/admin/crawler/crawler-nav';
import { actionSaveSchedule } from '../actions';
import { getAdminCrawlerService } from '@/lib/server/crawler/interfaces/admin-crawler-deps';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CrawlerSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const service = getAdminCrawlerService();
  const [overdue, profiles] = await Promise.all([
    service.getDashboard().then((d) => d.overdueSchedules),
    service.listProfiles(),
  ]);
  const runnableProfiles = profiles.filter(
    (profile) => profile.isEnabled && profile.currentVersionId != null,
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="font-meta mb-2">Schedules</p>
        <h1 className="font-serif text-3xl">调度</h1>
      </div>
      <CrawlerNav current="/admin/crawler/schedules" />
      {sp.ok && <p className="font-meta text-[13px] text-[#137333]">调度已保存</p>}
      {sp.error && <p className="font-meta text-[13px] text-[#C5221F]">保存失败</p>}

      <form action={actionSaveSchedule} className="surface-card p-5 space-y-3 grid sm:grid-cols-2 gap-3">
        <label className="block font-meta text-[12px] sm:col-span-2">
          名称
          <input name="name" required className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
        </label>
        <label className="block font-meta text-[12px] sm:col-span-2">
          采集模板
          <select name="profileVersionId" required className="admin-input mt-1">
            {runnableProfiles.map((profile) => (
              <option key={profile.id} value={profile.currentVersionId!}>
                {profile.name}（#{profile.id}）
              </option>
            ))}
          </select>
        </label>
        <label className="block font-meta text-[12px]">
          类型
          <select name="kind" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm">
            <option value="interval">interval</option>
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
            <option value="cron">cron</option>
            <option value="manual">manual</option>
          </select>
        </label>
        <label className="block font-meta text-[12px]">
          间隔秒
          <input name="intervalSeconds" defaultValue="3600" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
        </label>
        <label className="block font-meta text-[12px]">
          Cron（五字段）
          <input name="cron" placeholder="0 3 * * *" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
        </label>
        <label className="block font-meta text-[12px]">
          时区 (IANA)
          <input name="timezone" defaultValue="Asia/Shanghai" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
        </label>
        <label className="block font-meta text-[12px]">
          重叠策略
          <select name="overlapPolicy" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm">
            <option value="skip">skip</option>
            <option value="queue">queue</option>
            <option value="parallel">parallel</option>
          </select>
        </label>
        <label className="block font-meta text-[12px]">
          补跑策略
          <select name="misfirePolicy" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm">
            <option value="latest_only">latest_only</option>
            <option value="skip">skip</option>
            <option value="catch_up">catch_up</option>
          </select>
        </label>
        <label className="block font-meta text-[12px]">
          maxActiveJobs
          <input name="maxActiveJobs" defaultValue="1" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
        </label>
        <label className="block font-meta text-[12px]">
          catchUpLimit
          <input name="catchUpLimit" defaultValue="3" className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
        </label>
        <label className="block font-meta text-[12px] sm:col-span-2">
          next_run_at (ISO，可选)
          <input name="nextRunAt" placeholder={new Date().toISOString()} className="mt-1 w-full border border-[#EAEAEA] px-3 py-2 font-ui text-sm" />
        </label>
        <p className="sm:col-span-2 font-meta text-[12px] text-[#787774]">
          调度保存时自动复制模板与已激活 S3/SFTP 版本；后续修改模板或存储不会改变本调度快照。
        </p>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-ink">
            保存调度
          </button>
        </div>
      </form>

      <section className="space-y-2">
        <h2 className="font-ui text-sm font-semibold">逾期待领取（无 Worker 也可显示）</h2>
        {overdue.length === 0 ? (
          <p className="font-meta text-[13px] text-[#787774]">无逾期</p>
        ) : (
          <ul className="space-y-2">
            {overdue.map((o) => (
              <li key={o.scheduleId} className="surface-card p-3 font-meta text-[12px]">
                #{o.scheduleId} {o.name} · {o.nextRunAt} · points={o.overduePoints}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
