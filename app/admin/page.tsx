import Link from 'next/link';
import { desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animes, mangas, tags, users } from '@/lib/schema';
import { listAdminMangas } from '@/lib/server/manga-admin';
import { getSystemSettingsService } from '@/lib/server/system';
import { isOutboundMailReady } from '@/lib/server/system/domain/settings';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const [[animeCount], [mangaCount], [tagCount], [userCount], [activeCount], settings] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(animes),
      db.select({ count: sql<number>`count(*)` }).from(mangas),
      db.select({ count: sql<number>`count(*)` }).from(tags),
      db.select({ count: sql<number>`count(*)` }).from(users),
      db.select({ count: sql<number>`count(*)` }).from(animes).where(sql`${animes.isActive} = 1`),
      getSystemSettingsService().getAdminView(),
    ]);
  const [latestAnimes, latestMangas] = await Promise.all([
    db
      .select({ id: animes.id, title: animes.title, isActive: animes.isActive, updatedAt: animes.updatedAt })
      .from(animes)
      .orderBy(desc(animes.updatedAt), desc(animes.id))
      .limit(5),
    listAdminMangas({ page: 1, limit: 5 }),
  ]);
  const mailReady = isOutboundMailReady(settings.smtp);

  const cards = [
    { label: '里番', value: Number(animeCount.count), href: '/admin/animes' },
    { label: '漫画', value: Number(mangaCount.count), href: '/admin/mangas' },
    { label: '上架里番', value: Number(activeCount.count), href: '/admin/animes' },
    { label: '标签', value: Number(tagCount.count), href: '/admin/tags' },
    { label: '用户', value: Number(userCount.count), href: '/admin/users' },
  ];

  return (
    <div className="space-y-8">
      <header className="admin-page-intro">
        <p className="font-meta mb-2">主站维护</p>
        <h1 className="section-title text-3xl text-ink sm:text-4xl">今天要维护什么</h1>
        <p className="mt-2 max-w-xl font-ui text-sm leading-relaxed text-soft">
          从内容状态进入对应工作区。发布、上架、标签和账号操作都保留原有权限校验。
        </p>
      </header>
      {!mailReady && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/70 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-ui text-[13px] leading-relaxed text-soft">
            邮件发送未启用。前台找回密码只会显示统一提示，用户看不到具体原因。
          </p>
          <Link href="/admin/settings#smtp" className="btn-ghost !px-3 !py-1.5 !text-[12px] shrink-0">
            去配置
          </Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="surface-card p-5 hover:shadow-whisper transition-all duration-200 hover:-translate-y-0.5"
          >
            <p className="font-meta mb-2">{c.label}</p>
            <p className="font-ui text-2xl font-semibold tabular text-ink">{c.value}</p>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/animes/new" className="btn-ink">
          新建里番
        </Link>
        <Link href="/admin/mangas" className="btn-ghost">
          管理漫画
        </Link>
        <Link href="/admin/account" className="btn-ghost">
          账户与密码
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-ui text-sm font-semibold text-ink">里番最近变更</h2>
              <p className="mt-1 font-ui text-[12px] text-soft">直接进入编辑或状态操作</p>
            </div>
            <Link href="/admin/animes" className="btn-ghost !px-3 !py-1.5 !text-[12px]">全部</Link>
          </div>
          <ul className="divide-y divide-border/70">
            {latestAnimes.map((anime) => (
              <li key={anime.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${anime.isActive ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/40'}`} />
                <Link href={`/admin/animes/${anime.id}`} className="min-w-0 flex-1 truncate font-ui text-[13px] text-ink hover:underline">
                  {anime.title}
                </Link>
                <span className="shrink-0 font-meta text-[10px] normal-case tracking-normal text-soft">
                  {anime.isActive ? '上架' : '下架'}
                </span>
              </li>
            ))}
            {latestAnimes.length === 0 && <li className="px-5 py-8 font-ui text-sm text-soft">暂无里番记录</li>}
          </ul>
        </section>
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-ui text-sm font-semibold text-ink">漫画发布状态</h2>
              <p className="mt-1 font-ui text-[12px] text-soft">TG 发布后在这里检查封面与上架状态</p>
            </div>
            <Link href="/admin/mangas" className="btn-ghost !px-3 !py-1.5 !text-[12px]">全部</Link>
          </div>
          <ul className="divide-y divide-border/70">
            {latestMangas.data.map((manga) => (
              <li key={manga.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${manga.isPublished ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/40'}`} />
                <Link href={`/admin/mangas/${manga.id}`} className="min-w-0 flex-1 truncate font-ui text-[13px] text-ink hover:underline">
                  {manga.title}
                </Link>
                <span className="shrink-0 font-meta text-[10px] normal-case tracking-normal text-soft">
                  P{manga.pageCount ?? 0}
                </span>
              </li>
            ))}
            {latestMangas.data.length === 0 && <li className="px-5 py-8 font-ui text-sm text-soft">暂无漫画记录</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
