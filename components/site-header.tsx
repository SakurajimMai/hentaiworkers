import Link from 'next/link';
import { SiteHeaderClient } from '@/components/site-header-client';
import { UserMenu } from '@/components/user-menu';
import { getIdentityService } from '@/lib/server/identity';

export async function SiteHeader() {
  const user = await getIdentityService().getCurrentUser();
  const name = user ? user.displayName || user.username : '';
  const isAdmin = user?.role === 'admin';

  return (
    <SiteHeaderClient
      accountSlot={
        user ? (
          <UserMenu name={name} isAdmin={isAdmin} />
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="rounded-full px-2.5 py-1.5 font-ui text-[13px] text-soft hover:text-ink hover:bg-card transition-colors"
            >
              登录
            </Link>
            <Link href="/register" className="btn-ink !py-1.5 !px-3.5 !text-[12px]">
              注册
            </Link>
          </div>
        )
      }
      mobileAccountSlot={
        user ? (
          <UserMenu name={name} isAdmin={isAdmin} variant="list" />
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="rounded-full px-2.5 py-1.5 font-ui text-[13px] text-soft hover:text-ink hover:bg-card transition-colors"
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
