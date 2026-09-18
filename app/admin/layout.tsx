import { getSession } from '@/lib/auth';
import { actionLogout } from './actions';
import { AdminHeader } from '@/components/admin/admin-header';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
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
      <AdminHeader username={session.username} logoutAction={actionLogout} />
      <div id="admin-main" className="admin-shell py-8 pb-14">
        {children}
      </div>
    </div>
  );
}
