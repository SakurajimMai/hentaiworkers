import { desc, like, or, sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { actionSaveUser } from '../actions';
import { AdminPagination } from '@/components/admin/admin-pagination';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const where = q
    ? or(like(users.username, `%${q}%`), like(users.displayName, `%${q}%`))
    : undefined;

  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.id))
    .limit(PAGE_SIZE)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(where);
  const total = Number(countRow.count);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <header className="admin-page-intro">
        <p className="font-meta mb-2">用户与权限</p>
        <h1 className="section-title text-3xl text-ink sm:text-4xl">用户</h1>
        <p className="mt-2 max-w-2xl font-ui text-sm leading-relaxed text-soft">
          创建账号、改角色、启停和重置密码。停用或改密会使对方现有登录失效。
        </p>
      </header>

      <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="user-search" className="sr-only">
          搜索用户
        </label>
        <input
          id="user-search"
          name="q"
          defaultValue={q}
          placeholder="搜索用户名 / 显示名"
          className="admin-input max-w-sm"
        />
        <div className="flex gap-2">
          <button type="submit" className="btn-ghost">
            搜索
          </button>
          {q ? (
            <a href="/admin/users" className="btn-ghost !text-[13px]">
              清除
            </a>
          ) : null}
        </div>
      </form>

      <form action={actionSaveUser} className="surface-card grid gap-3 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-ui text-sm font-semibold text-ink">创建用户</h2>
        </div>
        <div>
          <label className="admin-label" htmlFor="new-username">
            用户名
          </label>
          <input id="new-username" name="username" className="admin-input" required />
        </div>
        <div>
          <label className="admin-label" htmlFor="new-password">
            密码（至少 8 位）
          </label>
          <input
            id="new-password"
            name="password"
            type="password"
            className="admin-input"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="admin-label" htmlFor="new-display">
            显示名
          </label>
          <input id="new-display" name="displayName" className="admin-input" />
        </div>
        <div>
          <label className="admin-label" htmlFor="new-role">
            角色
          </label>
          <select id="new-role" name="role" className="admin-input" defaultValue="user">
            <option value="user">用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <label className="field-check sm:col-span-2" htmlFor="newActive">
          <input type="checkbox" name="isActive" value="1" id="newActive" defaultChecked />
          启用此账号
        </label>
        <button type="submit" className="btn-ink w-fit sm:col-span-2">
          创建用户
        </button>
      </form>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/admin/users"
        query={{ q: q || undefined }}
      />

      <div className="surface-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户</th>
              <th>角色 / 状态</th>
              <th>更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="tabular text-soft">{u.id}</td>
                <td>
                  <div className="font-medium text-ink">{u.username}</div>
                  <div className="text-[12px] text-soft">{u.displayName || '—'}</div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={u.role === 'admin' ? 'status-pill status-pill-on' : 'admin-chip'}>
                      {u.role === 'admin' ? '管理员' : '用户'}
                    </span>
                    <span className={`status-pill ${u.isActive ? 'status-pill-on' : 'status-pill-off'}`}>
                      {u.isActive ? '启用' : '停用'}
                    </span>
                  </div>
                </td>
                <td>
                  <form action={actionSaveUser} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="username" value={u.username} />
                    <select
                      name="role"
                      defaultValue={u.role}
                      className="admin-input max-w-[7.5rem]"
                      aria-label={`角色 ${u.username}`}
                    >
                      <option value="user">用户</option>
                      <option value="admin">管理员</option>
                    </select>
                    <label className="field-check text-[12px]">
                      <input
                        type="checkbox"
                        name="isActive"
                        value="1"
                        defaultChecked={!!u.isActive}
                      />
                      启用
                    </label>
                    <input
                      name="password"
                      type="password"
                      placeholder="新密码（可选）"
                      className="admin-input max-w-[10rem]"
                      minLength={8}
                      autoComplete="new-password"
                    />
                    <button type="submit" className="btn-ghost !px-3 !py-1.5 !text-[12px]">
                      保存
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-soft">
                  {q ? '没有匹配的用户' : '暂无用户'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={totalPages}
        total={total}
        basePath="/admin/users"
        query={{ q: q || undefined }}
      />
    </div>
  );
}
