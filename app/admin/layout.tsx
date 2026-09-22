import { getSession } from '@/lib/auth';
import { actionLogout } from './actions';
import { AdminHeader } from '@/components/admin/admin-header';
import { getSiteSeo } from '@/lib/server/site-metadata';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, seo] = await Promise.all([
    getSession(),
    getSiteSeo().catch(() => ({ title: 'AnimeStream' })),
  ]);
  const isAuthed = session.isLoggedIn && session.role === 'admin';

  if (!isAuthed) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <a href="#admin-main" className="skip-link">
          跳到主要内容
        </a>
        <div id="admin-main">{children}</div>
      </div>
    );
  }

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
