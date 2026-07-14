import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppError } from '@/lib/server/shared/errors';
import { getSystemSettingsService } from '@/lib/server/system';

export const dynamic = 'force-dynamic';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token?.trim() || '';

  if (!token) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center space-y-4">
        <h1 className="font-serif text-2xl">验证链接无效</h1>
        <Link href="/login" className="btn-ink inline-flex">
          去登录
        </Link>
      </div>
    );
  }

  try {
    const user = await getSystemSettingsService().verifyEmailToken(token);
    if (user.role === 'admin') redirect('/admin');
    redirect('/favorites?ok=verified');
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    const message =
      error instanceof AppError ? error.message : '验证失败，请重新注册或联系管理员';
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center space-y-4">
        <h1 className="font-serif text-2xl">邮箱验证失败</h1>
        <p className="font-ui text-sm text-[#787774]">{message}</p>
        <Link href="/login" className="btn-ink inline-flex">
          去登录
        </Link>
      </div>
    );
  }
}
