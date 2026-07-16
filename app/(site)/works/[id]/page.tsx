import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconArrowLeft } from '@/components/icons';
import { WorksPlayPanel } from '@/components/works-play-panel';
import { getSystemSettingsService } from '@/lib/server/system';
import { getWorksQueryService } from '@/lib/server/works';

export const dynamic = 'force-dynamic';

function splitPeople(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,，、/|；;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default async function WorkWatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const [work, playerConfig] = await Promise.all([
    getWorksQueryService().getById(id, { activeOnly: true }),
    getSystemSettingsService().getPublicPlayerConfig(),
  ]);
  if (!work) notFound();

  const actors = splitPeople(work.actors);
  const directors = splitPeople(work.directors);
  const aliases = splitPeople(work.aliases || work.titleJapanese);

  const detailRows: Array<{ label: string; value: string }> = [];
  if (aliases.length) detailRows.push({ label: '别名', value: aliases.join(' / ') });
  if (directors.length) detailRows.push({ label: '导演', value: directors.join('、') });
  if (actors.length) detailRows.push({ label: '主演', value: actors.join('、') });
  if (work.area) detailRows.push({ label: '地区', value: work.area });
  if (work.lang) detailRows.push({ label: '语言', value: work.lang });
  if (work.releaseYear) detailRows.push({ label: '年份', value: String(work.releaseYear) });
  if (work.releaseDate) detailRows.push({ label: '上映', value: work.releaseDate });
  if (work.remarks) detailRows.push({ label: '备注', value: work.remarks });
  if (work.sourceUpdatedAt) {
    detailRows.push({ label: '更新时间', value: work.sourceUpdatedAt });
  } else if (work.updatedAt) {
    detailRows.push({ label: '站内更新', value: work.updatedAt.replace('T', ' ').slice(0, 19) });
  }

  return (
    <div className="pb-20 sm:pb-24">
      <div className="page-shell py-5 sm:py-8">
        <Link
          href="/works"
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 font-ui text-sm text-soft hover:bg-white hover:text-ink mb-5 transition"
        >
          <IconArrowLeft size={16} />
          返回动漫馆
        </Link>

        <WorksPlayPanel
          title={work.title}
          coverUrl={work.coverUrl}
          streamUrl={work.streamUrl}
          playLines={work.playLines}
          playerConfig={playerConfig}
        />

        <div className="mt-6 sm:mt-8 space-y-5 max-w-3xl">
          <div>
            <p className="font-meta mb-2">动漫详情</p>
            <h1 className="section-title text-2xl sm:text-3xl text-ink">{work.title}</h1>
            {(work.titleJapanese || work.titleEnglish) && (
              <p className="mt-2 font-ui text-sm text-soft">
                {[work.titleJapanese, work.titleEnglish].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {work.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {work.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full bg-[#f1efe9] px-2.5 py-1 font-ui text-[12px] text-[#444]"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {detailRows.length > 0 && (
            <dl className="surface-card divide-y divide-[#f0eee9] overflow-hidden">
              {detailRows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[5.5rem_1fr] gap-3 px-4 py-2.5 font-ui text-sm sm:grid-cols-[6.5rem_1fr]"
                >
                  <dt className="text-soft shrink-0">{row.label}</dt>
                  <dd className="text-ink break-words leading-relaxed">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {work.description && (
            <div className="space-y-2">
              <p className="font-meta">简介</p>
              <p className="font-ui text-sm text-[#444] leading-relaxed whitespace-pre-wrap">
                {work.description}
              </p>
            </div>
          )}

          <p className="rounded-xl border border-[#f0ebe3] bg-white px-4 py-3 font-meta text-[11px] normal-case tracking-normal text-[#8a877f]">
            本站仅索引外链，不托管视频文件。播放取决于源站 CDN / 防盗链策略；卡顿请切换线路。
            ArtPlayer 回退支持记忆播放、旋转与移动端横屏。
          </p>
        </div>
      </div>
    </div>
  );
}
