import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { actionLogout } from './actions';
import { AdminHeader } from '@/components/admin/admin-header';
import { getSiteSeo } from '@/lib/server/site-metadata';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, seo] = await Promise.all([
    getSession(),
    getSiteSeo().catch(() => ({ title: 'AnimeStream' })),
  ]);
  // The middleware already answers 404 without an admin cookie; never render the console shell for
  // anyone else. Pages still verify the account against the database with requireAdmin.
  if (!session.isLoggedIn || session.role !== 'admin') notFound();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a href="#admin-main" className="skip-link">
        跳到主要内容
      </a>
      <AdminHeader username={session.username} logoutAction={actionLogout} siteTitle={seo.title || 'AnimeStream'} />
      <div id="admin-main" className="admin-shell py-8 pb-14">
        {children}
      </div>
    </div>
  );
}
