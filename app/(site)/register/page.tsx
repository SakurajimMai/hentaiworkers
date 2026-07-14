import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getIdentityService } from '@/lib/server/identity';
import { actionPublicRegister } from '../auth/actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  exists: '该邮箱已注册，请直接登录。',
  email: '请输入有效邮箱地址。',
  password: '密码至少 8 位。',
  '1': '注册失败，请稍后重试。',
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const user = await getIdentityService().getCurrentUser();
  if (user) {
    redirect(user.role === 'admin' ? '/admin' : (sp.next?.startsWith('/') ? sp.next : '/favorites'));
  }

  return (
    <div className="mx-auto max-w-sm px-4 sm:px-6 py-12 sm:py-16">
      <p className="font-meta mb-2">Account</p>
      <h1 className="font-serif text-3xl mb-2">注册</h1>
      <p className="font-ui text-sm text-[#787774] mb-6">
        用邮箱创建账号，登录后可跨设备同步收藏。
      </p>

      {sp.error && (
        <p className="mb-4 font-ui text-sm text-[#C5221F]">
          {ERRORS[sp.error] ?? ERRORS['1']}
        </p>
      )}

      <form action={actionPublicRegister} className="surface-card p-6 space-y-4">
        <input type="hidden" name="next" value={sp.next || '/favorites'} />
        <div>
          <label className="admin-label" htmlFor="email">
            邮箱 *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={64}
            autoComplete="email"
            className="admin-input"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="admin-label" htmlFor="displayName">
            昵称（可选）
          </label>
          <input
            id="displayName"
            name="displayName"
            maxLength={64}
            autoComplete="nickname"
            className="admin-input"
            placeholder="显示名称"
          />
        </div>
        <div>
          <label className="admin-label" htmlFor="password">
            密码 *（至少 8 位）
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="admin-input"
          />
        </div>
        <button type="submit" className="btn-ink w-full">
          创建账号
        </button>
      </form>

      <p className="mt-6 font-ui text-sm text-[#787774] text-center">
        已有账号？{' '}
        <Link
          href={`/login${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ''}`}
          className="text-[#111] underline"
        >
          登录
        </Link>
      </p>
    </div>
  );
}
