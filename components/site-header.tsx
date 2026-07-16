import Link from 'next/link';
import { SiteHeaderClient } from '@/components/site-header-client';
import { getIdentityService } from '@/lib/server/identity';
import { actionPublicLogout } from '@/app/(site)/auth/actions';

export async function SiteHeader() {
  const user = await getIdentityService().getCurrentUser();

  return (
    <SiteHeaderClient
      accountSlot={
        user ? (
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link
              href="/history"
              className="hidden sm:inline rounded-full px-2.5 py-1 font-ui text-[13px] text-soft hover:bg-white hover:text-ink transition-colors"
            >
              历史
            </Link>
            <Link
              href="/favorites"
              className="hidden sm:inline rounded-full px-2.5 py-1 font-ui text-[13px] text-soft hover:bg-white hover:text-ink transition-colors"
            >
              片单
            </Link>
            <span className="hidden md:inline max-w-[9rem] truncate rounded-full border border-[#e8e4dc] bg-white/80 px-2.5 py-1 font-ui text-[12px] text-soft">
              {user.displayName || user.username}
            </span>
            <form action={actionPublicLogout}>
              <button
                type="submit"
                className="rounded-full border border-[#e8e4dc] bg-white px-3 py-1.5 font-ui text-[12px] font-medium text-[#333] hover:bg-[#f5f3ee] transition active:scale-[0.98]"
              >
                退出
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="rounded-full px-2.5 py-1.5 font-ui text-[13px] text-soft hover:text-ink hover:bg-white/70 transition-colors"
            >
              登录
            </Link>
            <Link href="/register" className="btn-ink !py-1.5 !px-3.5 !text-[12px]">
              注册
            </Link>
          </div>
        )
      }
    />
  );
}
