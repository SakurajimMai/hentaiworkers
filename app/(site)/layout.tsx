import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[#EAEAEA] mt-auto">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="font-meta">AnimeStream · Video Catalog</p>
          <div className="flex items-center gap-5 font-ui text-[13px] text-[#787774]">
            <Link href="/browse" className="hover:text-[#111]">
              片库
            </Link>
            <Link href="/browse?sort=popular" className="hover:text-[#111]">
              热门
            </Link>
            <Link href="/admin" className="hover:text-[#111]">
              管理
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
