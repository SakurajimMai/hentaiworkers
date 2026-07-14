import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animeTags, animes, tags } from '@/lib/schema';
import { actionSaveAnime } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function AdminAnimeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const isNew = idStr === 'new';
  const id = isNew ? null : parseInt(idStr, 10);
  if (!isNew && !Number.isFinite(id)) notFound();

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
        <p className="font-meta mb-2">Anime</p>
        <h1 className="font-serif text-3xl">{isNew ? '新建作品' : '编辑作品'}</h1>
      </div>

      <form action={actionSaveAnime} className="surface-card p-6 space-y-4">
        {anime && <input type="hidden" name="id" value={anime.id} />}
        <div>
          <label className="admin-label">标题 *</label>
          <input name="title" className="admin-input" required defaultValue={anime?.title || ''} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="admin-label">日文标题</label>
            <input
              name="titleJapanese"
              className="admin-input"
              defaultValue={anime?.titleJapanese || ''}
            />
          </div>
          <div>
            <label className="admin-label">英文标题</label>
            <input
              name="titleEnglish"
              className="admin-input"
              defaultValue={anime?.titleEnglish || ''}
            />
          </div>
        </div>
        <div>
          <label className="admin-label">视频地址 *</label>
          <input
            name="videoUrl"
            className="admin-input"
            required
            defaultValue={anime?.videoUrl || ''}
          />
        </div>
        <div>
          <label className="admin-label">封面 URL</label>
          <input name="cover" className="admin-input" defaultValue={anime?.cover || ''} />
        </div>
        <div>
          <label className="admin-label">剧照（逗号分隔 URL）</label>
          <textarea
            name="fanart"
            className="admin-input min-h-[80px]"
            defaultValue={anime?.fanart || ''}
          />
        </div>
        <div>
          <label className="admin-label">简介</label>
          <textarea
            name="description"
            className="admin-input min-h-[120px]"
            defaultValue={anime?.description || ''}
          />
        </div>
        <div>
          <label className="admin-label">标签（按住 Ctrl 多选）</label>
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
