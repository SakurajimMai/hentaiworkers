import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { actionLogout } from './actions';
import { AdminNav } from '@/components/admin/admin-nav';

const NAV = [
  { href: '/admin', label: '概览', exact: true },
  { href: '/admin/animes', label: '里番' },
  { href: '/admin/tags', label: '标签' },
  { href: '/admin/import', label: '导入' },
  { href: '/admin/users', label: '用户' },
  { href: '/admin/settings', label: '系统' },
  { href: '/admin/account', label: '账户' },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const isAuthed = session.isLoggedIn && session.role === 'admin';

  return (
    <div className="min-h-dvh bg-[#f4f2ed] text-[#1a1917]">
      <a href="#admin-main" className="skip-link">
        跳到主要内容
      </a>
      {isAuthed && (
        <header className="sticky top-0 z-40 border-b border-[#e8e4dc]/90 bg-[#fbfaf7]/88 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center gap-5">
            <Link href="/admin" className="font-ui text-sm font-semibold tracking-tight shrink-0">
              <span className="inline-flex items-center gap-2">
                <span className="h-6 w-6 rounded-md bg-[#1a1917] text-white grid place-items-center text-[10px] font-mono">
                  AS
                </span>
                Admin
              </span>
            </Link>
            <AdminNav items={[...NAV]} className="hidden lg:flex" />
            <div className="ml-auto flex items-center gap-3 font-ui text-[13px]">
              <span className="hidden sm:inline rounded-full bg-white/80 border border-[#ece8e0] px-2.5 py-1 text-[#6f6d68]">
                {session.username}
              </span>
              <form action={actionLogout}>
                <button
                  type="submit"
                  className="rounded-full border border-[#e6e3dc] bg-white px-3 py-1.5 text-[12px] font-medium text-[#333] hover:bg-[#f7f5f0] transition active:scale-[0.98]"
                >
                  退出
                </button>
              </form>
            </div>
          </div>
          <div className="lg:hidden border-t border-[#ece8e0] overflow-x-auto scrollbar-hide">
            <AdminNav
              items={[...NAV, { href: '/', label: '前台' }]}
              className="mx-auto max-w-6xl px-4 sm:px-6 py-2"
              compact
            />
          </div>
        </header>
      )}
      <div id="admin-main" className="mx-auto max-w-6xl px-4 sm:px-6 py-8 pb-12">
        {children}
      </div>
    </div>
  );
}
