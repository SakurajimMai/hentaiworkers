import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { animes, tags, users } from '@/lib/schema';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const [[animeCount], [tagCount], [userCount], [activeCount]] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(animes),
    db.select({ count: sql<number>`count(*)` }).from(tags),
    db.select({ count: sql<number>`count(*)` }).from(users),
    db.select({ count: sql<number>`count(*)` }).from(animes).where(sql`${animes.isActive} = 1`),
  ]);

  const cards = [
    { label: '里番', value: Number(animeCount.count), href: '/admin/animes' },
    { label: '上架', value: Number(activeCount.count), href: '/admin/animes' },
    { label: '标签', value: Number(tagCount.count), href: '/admin/tags' },
    { label: '用户', value: Number(userCount.count), href: '/admin/users' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="font-meta mb-2">Dashboard</p>
        <h1 className="section-title text-3xl text-ink">管理概览</h1>
        <p className="mt-2 font-ui text-sm text-soft max-w-xl leading-relaxed">
          从下方统计进入列表，管理片库内容与站点用户。
        </p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
        <Link href="/admin/import" className="btn-ghost">
          批量导入
        </Link>
      </div>
    </div>
  );
}
