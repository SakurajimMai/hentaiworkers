import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animeTags, animes, tags } from '@/lib/schema';
import { AutoGrowTextarea } from '@/components/admin/auto-grow-textarea';
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

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="font-meta mb-2">里番 · animes / tags</p>
        <h1 className="font-serif text-3xl">{isNew ? '新建里番' : '编辑里番'}</h1>
        <p className="mt-2 font-ui text-sm text-[#787774]">
          使用里番标签字典 tags；动漫标签在 work_tags，互不通用。
        </p>
      </div>

      <form action={actionSaveAnime} className="surface-card p-6 space-y-4">
        {anime && <input type="hidden" name="id" value={anime.id} />}
        <div>
          <label htmlFor="title" className="admin-label">标题 *</label>
          <input id="title" name="title" className="admin-input" required defaultValue={anime?.title || ''} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="titleJapanese" className="admin-label">日文标题</label>
            <input
              id="titleJapanese"
              name="titleJapanese"
              className="admin-input"
              defaultValue={anime?.titleJapanese || ''}
            />
          </div>
          <div>
            <label htmlFor="titleEnglish" className="admin-label">英文标题</label>
            <input
              id="titleEnglish"
              name="titleEnglish"
              className="admin-input"
              defaultValue={anime?.titleEnglish || ''}
            />
          </div>
        </div>
        <div>
          <label htmlFor="videoUrl" className="admin-label">视频地址 *</label>
          <AutoGrowTextarea
            id="videoUrl"
            name="videoUrl"
            rows={2}
            required
            singleLine
            defaultValue={anime?.videoUrl || ''}
          />
        </div>
        <div>
          <label htmlFor="cover" className="admin-label">封面 URL</label>
          <AutoGrowTextarea
            id="cover"
            name="cover"
            rows={2}
            singleLine
            defaultValue={anime?.cover || ''}
          />
        </div>
        <div>
          <label htmlFor="fanart" className="admin-label">剧照（逗号分隔 URL）</label>
          <AutoGrowTextarea
            id="fanart"
            name="fanart"
            rows={4}
            singleLine
            defaultValue={anime?.fanart || ''}
          />
        </div>
        <div>
          <label htmlFor="description" className="admin-label">简介</label>
          <AutoGrowTextarea
            id="description"
            name="description"
            rows={6}
            defaultValue={anime?.description || ''}
          />
        </div>
        <div>
          <label htmlFor="tagIds" className="admin-label">标签（按住 Ctrl 多选）</label>
          <select
            id="tagIds"
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
          <p className="mt-1 font-ui text-[11px] text-[#787774]">
            提交时会读取选中项；若浏览器多选有兼容问题，可之后用逗号 ID 字段扩展。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isActive"
            name="isActive"
            value="1"
            defaultChecked={anime ? !!anime.isActive : true}
          />
          <label htmlFor="isActive" className="font-ui text-sm">
            上架显示
          </label>
        </div>
        <button type="submit" className="btn-ink">
          保存
        </button>
      </form>
    </div>
  );
}
