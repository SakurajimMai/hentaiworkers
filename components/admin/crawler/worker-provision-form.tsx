'use client';

import { useActionState } from 'react';
import {
  actionProvisionWorker,
  type WorkerProvisionState,
} from '@/app/admin/crawler/actions';

const initialState: WorkerProvisionState = {};

export function WorkerProvisionForm() {
  const [state, action, pending] = useActionState(actionProvisionWorker, initialState);

  return (
    <section className="surface-card p-5 space-y-4">
      <div>
        <h2 className="font-ui text-sm font-semibold">创建 Worker</h2>
        <p className="mt-1 font-meta text-[12px] text-[#787774]">
          令牌只显示一次。Worker 启动前将其设置为 CRAWLER_WORKER_TOKEN。
        </p>
      </div>
      <form action={action} className="flex flex-col sm:flex-row gap-3">
        <label className="flex-1 font-meta text-[12px]">
          名称
          <input
            name="name"
            required
            maxLength={128}
            className="admin-input mt-1"
            placeholder="例如：crawler-01"
          />
        </label>
        <button type="submit" className="btn-ink self-end" disabled={pending}>
          {pending ? '创建中…' : '创建并签发令牌'}
        </button>
      </form>
      {state.error && (
        <p className="font-meta text-[12px] text-[#C5221F]">{state.error}</p>
      )}
      {state.token && state.workerId && (
        <div className="border border-[#D9EAD3] bg-[#F3F8F1] p-4 space-y-2">
          <p className="font-ui text-sm font-semibold">Worker #{state.workerId} 已创建</p>
          <code className="block break-all select-all font-mono text-[12px] text-[#111]">
            {state.token}
          </code>
          <p className="font-meta text-[11px] text-[#5F6B5A]">
            离开或刷新本页后无法再次查看该令牌。
          </p>
        </div>
      )}
    </section>
  );
}
