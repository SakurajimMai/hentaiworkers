import { actionChangePassword } from '../actions';

export default function AdminAccountPage() {
  return (
    <div className="space-y-6 max-w-md">
      <div>
        <p className="font-meta mb-2">Account</p>
        <h1 className="font-serif text-3xl">修改密码</h1>
      </div>
      <form action={actionChangePassword} className="surface-card p-6 space-y-4">
        <div>
          <label className="admin-label">当前密码</label>
          <input name="current" type="password" className="admin-input" required />
        </div>
        <div>
          <label className="admin-label">新密码（≥8）</label>
          <input name="next" type="password" className="admin-input" required minLength={8} />
        </div>
        <button type="submit" className="btn-ink">
          保存
        </button>
      </form>
    </div>
  );
}
