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
    { label: '作品总数', value: Number(animeCount.count), href: '/admin/animes' },
    { label: '上架中', value: Number(activeCount.count), href: '/admin/animes' },
    { label: '标签', value: Number(tagCount.count), href: '/admin/tags' },
    { label: '用户', value: Number(userCount.count), href: '/admin/users' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="font-meta mb-2">Dashboard</p>
        <h1 className="font-serif text-3xl">管理概览</h1>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="surface-card p-5 hover:shadow-whisper transition-shadow">
            <p className="font-meta mb-2">{c.label}</p>
            <p className="font-ui text-2xl font-semibold tabular">{c.value}</p>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/animes/new" className="btn-ink">
          新建作品
        </Link>
        <Link href="/admin/import" className="btn-ghost">
          批量导入
        </Link>
      </div>
    </div>
  );
}
