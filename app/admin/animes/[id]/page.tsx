import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animeTags, animes, tags } from '@/lib/schema';
import { AutoGrowTextarea } from '@/components/admin/auto-grow-textarea';
import { HistoryBackLink } from '@/components/history-back-link';
import { IconArrowLeft, IconExternalLink, IconFilm, IconTag } from '@/components/icons';
import { actionSaveAnime } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function AdminAnimeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const isNew = idStr === 'new';
  if (!isNew && !/^\d+$/.test(idStr)) notFound();
  const id = isNew ? null : Number(idStr);
  if (!isNew && (!Number.isSafeInteger(id) || (id ?? 0) <= 0)) notFound();

  let anime: typeof animes.$inferSelect | null = null;
  let selectedTagIds: number[] = [];

  if (id) {
    const [row] = await db.select().from(animes).where(eq(animes.id, id)).limit(1);
    if (!row) notFound();
    anime = row;
    const links = await db
      .select({ tagId: animeTags.tagId })
      .from(animeTags)
      .where(eq(animeTags.animeId, id));
    selectedTagIds = links.map((l) => l.tagId);
  }

  const allTags = await db.select().from(tags).orderBy(tags.name);
  const selectedSet = new Set(selectedTagIds);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <HistoryBackLink
            href="/admin/animes"
            className="inline-flex items-center gap-1.5 font-ui text-[12px] text-soft hover:text-ink transition-colors mb-2"
          >
            <IconArrowLeft size={14} />
            返回里番列表
          </HistoryBackLink>
          <div className="flex items-center gap-2 mt-1">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-secondary text-soft">
              <IconFilm size={14} />
            </span>
            <p className="font-meta normal-case tracking-normal text-[11px] text-soft">
              {isNew ? '新建作品' : `ID #${anime?.id}`}
            </p>
          </div>
          <h1 className="section-title text-3xl text-ink mt-1">
            {isNew ? '新建里番' : (anime?.title || '编辑里番')}
          </h1>
        </div>
        {!isNew && anime && (
          <div className="flex items-center gap-2">
            <Link
              href={`/watch/${anime.id}`}
              target="_blank"
              className="btn-ghost !text-[12px]"
            >
              前台播放
              <IconExternalLink size={13} />
            </Link>
          </div>
        )}
      </div>

      <form action={actionSaveAnime} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {anime && <input type="hidden" name="id" value={anime.id} />}

        {/* Left Column: Main form */}
        <div className="space-y-5">
          <div className="surface-card p-5 sm:p-6 space-y-4">
            <h2 className="font-ui text-sm font-semibold text-ink border-b border-border pb-3">
              基础信息
            </h2>
            <div>
              <label htmlFor="title" className="admin-label">
                标题 <span className="text-danger">*</span>
              </label>
              <input
                id="title"
                name="title"
                className="admin-input"
                required
                defaultValue={anime?.title || ''}
                placeholder="例如：作品中文名或标准译名"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="titleJapanese" className="admin-label">
                  日文原名
                </label>
                <input
                  id="titleJapanese"
                  name="titleJapanese"
                  className="admin-input"
                  defaultValue={anime?.titleJapanese || ''}
                  placeholder="原版日文标题"
                />
              </div>
              <div>
                <label htmlFor="titleEnglish" className="admin-label">
                  英文原名
                </label>
                <input
                  id="titleEnglish"
                  name="titleEnglish"
                  className="admin-input"
                  defaultValue={anime?.titleEnglish || ''}
                  placeholder="Romaji 或 英文译名"
                />
              </div>
            </div>
          </div>

          <div className="surface-card p-5 sm:p-6 space-y-4">
            <h2 className="font-ui text-sm font-semibold text-ink border-b border-border pb-3">
              媒体与资源
            </h2>
            <div>
              <label htmlFor="videoUrl" className="admin-label">
                视频播放地址 (MP4 / HLS) <span className="text-danger">*</span>
              </label>
              <AutoGrowTextarea
                id="videoUrl"
                name="videoUrl"
                rows={2}
                required
                singleLine
                defaultValue={anime?.videoUrl || ''}
                placeholder="https://.../video.mp4"
              />
              <p className="mt-1 font-ui text-[11px] text-soft">
                支持直接托管的 MP4 或标准流媒体播放地址。
              </p>
            </div>
            <div>
              <label htmlFor="cover" className="admin-label">
                海报封面 URL
              </label>
              <AutoGrowTextarea
                id="cover"
                name="cover"
                rows={2}
                singleLine
                defaultValue={anime?.cover || ''}
                placeholder="https://.../cover.jpg"
              />
            </div>
            <div>
              <label htmlFor="fanart" className="admin-label">
                剧照 / 预览图 (逗号分隔多个 URL)
              </label>
              <AutoGrowTextarea
                id="fanart"
                name="fanart"
                rows={4}
                singleLine
                defaultValue={anime?.fanart || ''}
                placeholder="https://.../shot1.jpg, https://.../shot2.jpg"
              />
            </div>
          </div>

          <div className="surface-card p-5 sm:p-6 space-y-4">
            <h2 className="font-ui text-sm font-semibold text-ink border-b border-border pb-3">
              内容简介
            </h2>
            <div>
              <AutoGrowTextarea
                id="description"
                name="description"
                rows={6}
                defaultValue={anime?.description || ''}
                placeholder="输入故事梗概、制作人员或剧情简介..."
              />
            </div>
          </div>
        </div>

        {/* Right Column: Sidebar */}
        <aside className="space-y-5">
          {/* Publish Action Card */}
          <div className="surface-card p-5 space-y-4">
            <h2 className="font-ui text-sm font-semibold text-ink">发布状态</h2>
            <label className="flex items-center gap-2.5 font-ui text-[13px] text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                id="isActive"
                name="isActive"
                value="1"
                defaultChecked={anime ? !!anime.isActive : true}
              />
              <span>上架公开显示</span>
            </label>
            <div className="pt-2 border-t border-border flex flex-col gap-2">
              <button type="submit" className="btn-ink w-full">
                保存里番
              </button>
              <HistoryBackLink href="/admin/animes" className="btn-ghost w-full text-center">
                取消返回
              </HistoryBackLink>
            </div>
          </div>

          {/* Cover Preview Card */}
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-ui text-sm font-semibold text-ink">封面预览</h2>
            </div>
            {anime?.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={anime.cover}
                alt={anime.title || '封面'}
                className="aspect-[2/3] w-full object-cover bg-secondary"
                loading="lazy"
              />
            ) : (
              <div className="grid aspect-[2/3] place-items-center bg-secondary font-ui text-[13px] text-muted-foreground p-4 text-center">
                保存封面 URL 后在此预览
              </div>
            )}
          </div>

          {/* Tags Card */}
          <div className="surface-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-ui text-sm font-semibold text-ink flex items-center gap-1.5">
                <IconTag size={14} className="text-accent" />
                分类标签
              </h2>
              <span className="font-meta text-[10px] text-soft">
                已选 {selectedTagIds.length} 个
              </span>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {allTags.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-ui text-foreground hover:bg-secondary cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    name="tagIds"
                    value={t.id}
                    defaultChecked={selectedSet.has(t.id)}
                  />
                  <span>{t.name}</span>
                </label>
              ))}
              {allTags.length === 0 && (
                <p className="font-ui text-[12px] text-soft py-2 text-center">
                  暂无标签，可前往「里番标签」添加。
                </p>
              )}
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
