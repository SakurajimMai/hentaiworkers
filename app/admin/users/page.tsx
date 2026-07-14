import { desc, like, or, sql } from 'drizzle-orm';
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
      <div>
        <p className="font-meta mb-2">Users</p>
        <h1 className="font-serif text-3xl">用户与权限</h1>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索用户名 / 显示名"
          className="admin-input max-w-sm"
        />
        <button type="submit" className="btn-ghost">
          搜索
        </button>
      </form>

      <form action={actionSaveUser} className="surface-card p-5 grid sm:grid-cols-2 gap-3">
        <div>
          <label className="admin-label">用户名 *</label>
          <input name="username" className="admin-input" required />
        </div>
        <div>
          <label className="admin-label">密码 *（≥8）</label>
          <input name="password" type="password" className="admin-input" required minLength={8} />
        </div>
        <div>
          <label className="admin-label">显示名</label>
          <input name="displayName" className="admin-input" />
        </div>
        <div>
          <label className="admin-label">角色</label>
          <select name="role" className="admin-input" defaultValue="user">
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="isActive" value="1" id="newActive" defaultChecked />
          <label htmlFor="newActive" className="font-ui text-sm">
            启用
          </label>
        </div>
        <button type="submit" className="btn-ink sm:col-span-2 w-fit">
          创建用户
        </button>
      </form>

      <div className="surface-card overflow-x-auto">
        <table className="w-full text-left font-ui text-sm">
          <thead className="border-b border-[#EAEAEA] text-[#787774]">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">用户</th>
              <th className="p-3">角色 / 状态 / 重置密码</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-[#EAEAEA] last:border-0 align-top">
                <td className="p-3 tabular text-[#787774]">{u.id}</td>
                <td className="p-3">
                  <div className="font-medium">{u.username}</div>
                  <div className="text-[12px] text-[#787774]">{u.displayName || '—'}</div>
                </td>
                <td className="p-3">
                  <form action={actionSaveUser} className="flex flex-wrap gap-2 items-center">
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="username" value={u.username} />
                    <select name="role" defaultValue={u.role} className="admin-input max-w-[120px]">
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                    <label className="inline-flex items-center gap-1 text-[12px]">
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
                      placeholder="新密码(可选)"
                      className="admin-input max-w-[140px]"
                      minLength={8}
                    />
                    <button type="submit" className="text-[12px] underline">
                      更新
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-[#787774]">
                  暂无用户
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
