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
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/favorites"
              className="hidden sm:inline font-ui text-[13px] text-[#787774] hover:text-[#111]"
            >
              收藏
            </Link>
            <span className="hidden md:inline font-ui text-[12px] text-[#787774] max-w-[10rem] truncate">
              {user.displayName || user.username}
            </span>
            <form action={actionPublicLogout}>
              <button
                type="submit"
                className="font-ui text-[13px] text-[#787774] hover:text-[#111]"
              >
                退出
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/login"
              className="font-ui text-[13px] text-[#787774] hover:text-[#111]"
            >
              登录
            </Link>
            <Link href="/register" className="btn-ink !py-1.5 !px-3 !text-[12px]">
              注册
            </Link>
          </div>
        )
      }
    />
  );
}
