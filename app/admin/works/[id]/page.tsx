import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workTags } from '@/lib/schema';
import { requireAdmin } from '@/lib/auth';
import { getWorksQueryService } from '@/lib/server/works';
import { WorksPlayLinesEditor } from '@/components/admin/works-play-lines-editor';
import { actionDeleteWork, actionSaveWork, actionToggleWork } from '../../actions';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';

export const dynamic = 'force-dynamic';

export default async function AdminWorkEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const work = await getWorksQueryService().getById(id, { activeOnly: false });
  if (!work) notFound();

  // 动漫标签字典 work_tags，与里番 tags 分离
  const allTags = await db.select().from(workTags).orderBy(workTags.name);
  const selectedTagIds = work.tags.map((t) => t.id);
  const episodeCount = work.playLines.reduce((sum, line) => sum + line.episodes.length, 0);

  const error = typeof sp.error === 'string' ? sp.error : '';
  const ok = sp.ok === '1' || sp.ok === 'true';

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-meta mb-2">动漫 #{work.id} · work_tags</p>
          <h1 className="font-serif text-3xl">编辑动漫</h1>
          <p className="mt-2 font-ui text-sm text-[#787774] max-w-2xl">
            可改标题、封面、简介、默认播放地址、备注、线路分集与动漫标签。来源溯源只读；标签仅限 work_tags，与里番 tags 分离。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/works" className="btn-ghost">
            ← 列表
          </Link>
          <Link href={`/works/${work.id}`} className="btn-ghost" target="_blank">
            前台预览 →
          </Link>
        </div>
      </div>

      {ok && (
        <p className="surface-card px-4 py-3 font-ui text-sm text-[#111]">
          已保存。
        </p>
      )}
      {error === 'required' && (
        <p className="surface-card px-4 py-3 font-ui text-sm text-red-700">
          标题与默认播放地址为必填。
        </p>
      )}
      {error === 'playlines' && (
        <p className="surface-card px-4 py-3 font-ui text-sm text-red-700">
          线路 JSON 无法解析或没有有效分集。请检查格式，或清空该字段以不改线路。
        </p>
      )}

      <div className="surface-card p-4 font-ui text-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-4">
          {work.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={work.coverUrl}
              alt=""
              className="h-40 w-28 shrink-0 rounded-md object-cover border border-[#EAEAEA] bg-[#F0F0F0]"
            />
          ) : (
            <div className="h-40 w-28 shrink-0 rounded-md border border-dashed border-[#D0D0D0] bg-[#F7F6F3] flex items-center justify-center font-meta text-[11px] text-[#787774]">
              无封面
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>
                <span className="text-[#787774]">状态</span> {work.isActive ? '上架' : '下架'}
              </span>
              <span>
                <span className="text-[#787774]">格式</span> {work.streamFormat}
              </span>
              <span>
                <span className="text-[#787774]">线路/集</span> {work.playLines.length} / {episodeCount}
              </span>
              <span>
                <span className="text-[#787774]">播放量</span> {work.viewCount}
              </span>
              <span>
                <span className="text-[#787774]">更新</span> {work.updatedAt}
              </span>
            </div>
            <div className="break-all">
              <span className="text-[#787774]">来源（只读）</span>{' '}
              {work.sources.map((s) => `${s.source}:${s.sourceId}`).join(', ') || '—'}
            </div>
            {work.remarks && (
              <div>
                <span className="text-[#787774]">备注</span> {work.remarks}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <form action={actionToggleWork}>
                <input type="hidden" name="id" value={work.id} />
                <input type="hidden" name="isActive" value={work.isActive ? '0' : '1'} />
                <button type="submit" className="btn-ghost !py-1.5 !px-3 !text-[12px]">
                  {work.isActive ? '一键下架' : '一键上架'}
                </button>
              </form>
              <form action={actionDeleteWork}>
                <input type="hidden" name="id" value={work.id} />
                <ConfirmSubmitButton
                  title="删除确认"
                  message={`确定删除「${work.title}」？此操作不可恢复。`}
                  className="btn-danger !py-1.5 !px-3 !text-[12px]"
                  confirmLabel="删除"
                >
                  删除
                </ConfirmSubmitButton>
              </form>
            </div>
          </div>
        </div>
      </div>

      <form action={actionSaveWork} className="surface-card p-6 space-y-4">
        <input type="hidden" name="id" value={work.id} />
        <div>
          <label className="admin-label">标题 *</label>
          <input name="title" className="admin-input" required defaultValue={work.title} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="admin-label">日文标题</label>
            <input
              name="titleJapanese"
              className="admin-input"
              defaultValue={work.titleJapanese || ''}
            />
          </div>
          <div>
            <label className="admin-label">英文标题</label>
            <input
              name="titleEnglish"
              className="admin-input"
              defaultValue={work.titleEnglish || ''}
            />
          </div>
        </div>
        <div>
          <label className="admin-label">默认播放地址 *</label>
          <input
            name="streamUrl"
            className="admin-input"
            required
            defaultValue={work.streamUrl}
          />
          <p className="mt-1 font-ui text-[11px] text-[#787774]">
            列表/兼容用默认流；完整线路请在下方 JSON 维护。
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="admin-label">流格式</label>
            <input
              name="streamFormat"
              className="admin-input"
              defaultValue={work.streamFormat || 'hls'}
              placeholder="hls / external"
            />
          </div>
          <div>
            <label className="admin-label">备注（如更新至xx集）</label>
            <input
              name="remarks"
              className="admin-input"
              defaultValue={work.remarks || ''}
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="admin-label">年份</label>
            <input
              name="releaseYear"
              className="admin-input"
              inputMode="numeric"
              defaultValue={work.releaseYear ?? ''}
            />
          </div>
          <div>
            <label className="admin-label">上映日期</label>
            <input
              name="releaseDate"
              className="admin-input"
              defaultValue={work.releaseDate || ''}
              placeholder="YYYY-MM-DD"
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="admin-label">导演</label>
            <input
              name="directors"
              className="admin-input"
              defaultValue={work.directors || ''}
              placeholder="逗号分隔"
            />
          </div>
          <div>
            <label className="admin-label">主演</label>
            <input
              name="actors"
              className="admin-input"
              defaultValue={work.actors || ''}
              placeholder="逗号分隔"
            />
          </div>
        </div>
        <div>
          <label className="admin-label">别名</label>
          <input
            name="aliases"
            className="admin-input"
            defaultValue={work.aliases || ''}
            placeholder="可与日文标题相同"
          />
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="admin-label">地区</label>
            <input name="area" className="admin-input" defaultValue={work.area || ''} />
          </div>
          <div>
            <label className="admin-label">语言</label>
            <input name="lang" className="admin-input" defaultValue={work.lang || ''} />
          </div>
          <div>
            <label className="admin-label">源站更新时间</label>
            <input
              name="sourceUpdatedAt"
              className="admin-input"
              defaultValue={work.sourceUpdatedAt || ''}
              placeholder="2026-07-14 23:18:30"
            />
          </div>
        </div>
        <div>
          <label className="admin-label">封面 URL</label>
          <input name="coverUrl" className="admin-input" defaultValue={work.coverUrl || ''} />
        </div>
        <div>
          <label className="admin-label">剧照（逗号或换行分隔 URL）</label>
          <textarea
            name="fanart"
            className="admin-input min-h-[80px]"
            defaultValue={work.fanartUrls.join('\n')}
          />
        </div>
        <div>
          <label className="admin-label">简介</label>
          <textarea
            name="description"
            className="admin-input min-h-[120px]"
            defaultValue={work.description || ''}
          />
        </div>
        <div>
          <label className="admin-label">标签（Ctrl/⌘ 多选）</label>
          <select
            name="tagIds"
            multiple
            className="admin-input min-h-[160px]"
            defaultValue={selectedTagIds.map(String)}
          >
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <WorksPlayLinesEditor
          initialLines={work.playLines.map((line) => ({
            name: line.name,
            flag: line.flag,
            episodes: line.episodes.map((ep) => ({ name: ep.name, url: ep.url })),
          }))}
        />
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isActive"
            name="isActive"
            value="1"
            defaultChecked={work.isActive}
          />
          <label htmlFor="isActive" className="font-ui text-sm">
            上架显示
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-ink">
            保存
          </button>
          <Link href="/admin/works" className="btn-ghost">
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
