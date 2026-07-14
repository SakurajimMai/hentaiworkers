import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { actionLogout } from './actions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const isAuthed = session.isLoggedIn && session.role === 'admin';

  return (
    <div className="min-h-dvh bg-[#F7F6F3] text-[#111]">
      {isAuthed && (
        <header className="border-b border-[#EAEAEA] bg-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center gap-6">
            <Link href="/admin" className="font-ui text-sm font-semibold">
              AnimeStream Admin
            </Link>
            <nav className="flex flex-wrap items-center gap-4 font-ui text-[13px] text-[#787774]">
              <Link href="/admin/animes" className="hover:text-[#111]">
                作品
              </Link>
              <Link href="/admin/tags" className="hover:text-[#111]">
                标签
              </Link>
              <Link href="/admin/import" className="hover:text-[#111]">
                导入
              </Link>
              <Link href="/admin/users" className="hover:text-[#111]">
                用户
              </Link>
              <Link href="/admin/settings" className="hover:text-[#111]">
                系统
              </Link>
              <Link href="/admin/crawler" className="hover:text-[#111]">
                爬虫
              </Link>
              <Link href="/admin/account" className="hover:text-[#111]">
                账户
              </Link>
              <Link href="/" className="hover:text-[#111]">
                前台
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-3 font-ui text-[13px]">
              <span className="text-[#787774]">{session.username}</span>
              <form action={actionLogout}>
                <button type="submit" className="text-[#111] underline-offset-2 hover:underline">
                  退出
                </button>
              </form>
            </div>
          </div>
        </header>
      )}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">{children}</div>
    </div>
  );
}
