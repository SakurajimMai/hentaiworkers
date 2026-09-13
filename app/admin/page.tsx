import Link from 'next/link';
import { desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animes, mangas, tags, users } from '@/lib/schema';
import { listAdminMangas } from '@/lib/server/manga-admin';
import { getSystemSettingsService } from '@/lib/server/system';
import { isOutboundMailReady } from '@/lib/server/system/domain/settings';

import {
  IconAlert,
  IconBook,
  IconCheck,
  IconFilm,
  IconPlus,
  IconSettings,
  IconTag,
  IconUser,
  IconUsers,
} from '@/components/icons';

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
      .limit(6),
    listAdminMangas({ page: 1, limit: 6 }),
  ]);
  const mailReady = isOutboundMailReady(settings.smtp);

  const cards = [
    { label: '里番总数', value: Number(animeCount.count), href: '/admin/animes', icon: IconFilm, desc: '已录入视频' },
    { label: '漫画作品', value: Number(mangaCount.count), href: '/admin/mangas', icon: IconBook, desc: '已发布漫画' },
    { label: '在架里番', value: Number(activeCount.count), href: '/admin/animes', icon: IconCheck, desc: '前台公开可见' },
    { label: '里番标签', value: Number(tagCount.count), href: '/admin/tags', icon: IconTag, desc: '分类标签' },
    { label: '注册用户', value: Number(userCount.count), href: '/admin/users', icon: IconUsers, desc: '账号总数' },
  ];

  return (
    <div className="space-y-8">
      <header className="admin-page-intro flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--success-soft))] px-2.5 py-0.5 font-meta text-[11px] font-medium text-[hsl(var(--success))]">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
              系统正常运行
            </span>
          </div>
          <h1 className="section-title text-3xl text-ink sm:text-4xl">控制台概览</h1>
          <p className="mt-2 max-w-xl font-ui text-sm leading-relaxed text-soft">
            掌握片库规模、漫画发布状态与核心服务。点击指标卡可快速进入对应工作区。
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/admin/animes/new" className="btn-ink !text-[13px]">
            <IconPlus size={14} />
            新建里番
          </Link>
          <Link href="/admin/settings" className="btn-ghost !text-[13px]">
            <IconSettings size={14} />
            系统设置
          </Link>
        </div>
      </header>

      {!mailReady && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <IconAlert size={18} />
            </span>
            <div>
              <p className="font-ui text-sm font-semibold text-ink">SMTP 邮件服务未启用</p>
              <p className="font-ui text-[12px] text-soft mt-0.5">
                前台找回密码与邮箱验证依赖发信服务。未配置时前台只会显示统一提示。
              </p>
            </div>
          </div>
          <Link href="/admin/settings#smtp" className="btn-ghost !px-3.5 !py-1.5 !text-[12px] shrink-0">
            前往配置
          </Link>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.label}
              href={c.href}
              className="admin-kpi-card group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-meta text-[11px] normal-case tracking-normal text-soft">{c.label}</span>
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-secondary text-soft transition-colors group-hover:bg-accent group-hover:text-white">
                    <Icon size={14} />
                  </span>
                </div>
                <p className="font-ui text-3xl font-semibold tabular text-ink tracking-tight">{c.value}</p>
              </div>
              <p className="mt-3 font-ui text-[11px] text-muted-foreground transition-colors group-hover:text-ink">
                {c.desc} →
              </p>
            </Link>
          );
        })}
      </div>

      {/* Quick navigation */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <span className="font-meta text-[11px] text-soft mr-1">快捷入口:</span>
        <Link href="/admin/animes" className="btn-ghost !px-3 !py-1.5 !text-[12px]">
          <IconFilm size={13} />
          里番管理
        </Link>
        <Link href="/admin/mangas" className="btn-ghost !px-3 !py-1.5 !text-[12px]">
          <IconBook size={13} />
          漫画管理
        </Link>
        <Link href="/admin/tags" className="btn-ghost !px-3 !py-1.5 !text-[12px]">
          <IconTag size={13} />
          标签管理
        </Link>
        <Link href="/admin/users" className="btn-ghost !px-3 !py-1.5 !text-[12px]">
          <IconUsers size={13} />
          用户权限
        </Link>
        <Link href="/admin/account" className="btn-ghost !px-3 !py-1.5 !text-[12px]">
          <IconUser size={13} />
          当前账户
        </Link>
      </div>

      {/* Recent changes split grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-ui text-sm font-semibold text-ink">里番最近变更</h2>
              <p className="mt-0.5 font-ui text-[12px] text-soft">点击快速进入详情或编辑</p>
            </div>
            <Link href="/admin/animes" className="btn-ghost !px-3 !py-1 !text-[12px]">
              查看全部
            </Link>
          </div>
          <ul className="divide-y divide-border/70">
            {latestAnimes.map((anime) => (
              <li key={anime.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2 transition-colors">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${anime.isActive ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/40'}`} />
                  <Link href={`/admin/animes/${anime.id}`} className="truncate font-ui text-[13px] font-medium text-ink hover:underline">
                    {anime.title}
                  </Link>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`status-pill ${anime.isActive ? 'status-pill-on' : 'status-pill-off'}`}>
                    {anime.isActive ? '上架' : '下架'}
                  </span>
                  <Link href={`/admin/animes/${anime.id}`} className="admin-btn-action !px-2 !py-0.5 text-[11px]">
                    编辑
                  </Link>
                </div>
              </li>
            ))}
            {latestAnimes.length === 0 && <li className="px-5 py-8 text-center font-ui text-sm text-soft">暂无里番记录</li>}
          </ul>
        </section>

        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-ui text-sm font-semibold text-ink">漫画发布状态</h2>
              <p className="mt-0.5 font-ui text-[12px] text-soft">检查封面、页数与上架状态</p>
            </div>
            <Link href="/admin/mangas" className="btn-ghost !px-3 !py-1 !text-[12px]">
              查看全部
            </Link>
          </div>
          <ul className="divide-y divide-border/70">
            {latestMangas.data.map((manga) => (
              <li key={manga.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2 transition-colors">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${manga.isPublished ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/40'}`} />
                  <Link href={`/admin/mangas/${manga.id}`} className="truncate font-ui text-[13px] font-medium text-ink hover:underline">
                    {manga.title}
                  </Link>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-meta text-[11px] normal-case tracking-normal text-soft tabular">
                    P{manga.pageCount ?? 0}
                  </span>
                  <span className={`status-pill ${manga.isPublished ? 'status-pill-on' : 'status-pill-off'}`}>
                    {manga.isPublished ? '上架' : '下架'}
                  </span>
                  <Link href={`/admin/mangas/${manga.id}`} className="admin-btn-action !px-2 !py-0.5 text-[11px]">
                    管理
                  </Link>
                </div>
              </li>
            ))}
            {latestMangas.data.length === 0 && <li className="px-5 py-8 text-center font-ui text-sm text-soft">暂无漫画记录</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
