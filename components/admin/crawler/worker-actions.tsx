'use client';

import { useActionState } from 'react';
import {
  actionManageWorker,
  type WorkerActionState,
} from '@/app/admin/crawler/actions';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';

const initialState: WorkerActionState = {};
const successLabels: Readonly<Record<string, string>> = {
  pause: '已暂停领取',
  resume: '已恢复领取',
  rotate: '令牌已轮换',
  revoke: '令牌已撤销',
  disable: '节点已硬禁用',
  enable: '节点已重新启用',
};

export function WorkerActions({
  workerId,
  claimEnabled,
  isEnabled,
  credentialId,
  credentialRevoked,
}: {
  workerId: number;
  claimEnabled: boolean;
  isEnabled: boolean;
  credentialId: number | null;
  credentialRevoked: boolean;
}) {
  const [state, action, pending] = useActionState(actionManageWorker, initialState);
  const hidden = (operation: string) => (
    <>
      <input type="hidden" name="workerId" value={workerId} />
      <input type="hidden" name="operation" value={operation} />
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <form action={action}>
          {hidden(claimEnabled ? 'pause' : 'resume')}
          <button type="submit" className="btn-ghost" disabled={pending || !isEnabled}>
            {claimEnabled ? '暂停领取' : '恢复领取'}
          </button>
        </form>
        <form action={action}>
          {hidden('rotate')}
          <button type="submit" className="btn-ghost" disabled={pending}>
            轮换令牌
          </button>
        </form>
        {credentialId != null && !credentialRevoked && (
          <form action={action}>
            {hidden('revoke')}
            <input type="hidden" name="credentialId" value={credentialId} />
            <ConfirmSubmitButton
              message="确认立即撤销该 Worker 的机器令牌？容器后续请求将被拒绝。"
              className="btn-ghost text-[#9F2F2D]"
              disabled={pending}
              confirmLabel="撤销令牌"
            >
              撤销令牌
            </ConfirmSubmitButton>
          </form>
        )}
        <form action={action}>
          {hidden(isEnabled ? 'disable' : 'enable')}
          {isEnabled ? (
            <ConfirmSubmitButton
              message="确认硬禁用该节点？正在执行的任务可能因后续心跳和提交被拒绝而中断。通常应先暂停领取并等待排空。"
              className="btn-ghost text-[#9F2F2D]"
              disabled={pending}
              confirmLabel="硬禁用"
            >
              硬禁用节点
            </ConfirmSubmitButton>
          ) : (
            <button type="submit" className="btn-ghost" disabled={pending}>
              重新启用节点
            </button>
          )}
        </form>
      </div>

      {state.error && (
        <p className="font-meta text-[12px] text-[#C5221F]">{state.error}</p>
      )}
      {state.ok && !state.token && (
        <p className="font-meta text-[12px] text-[#137333]">
          {successLabels[state.ok] ?? '操作已完成'}
        </p>
      )}
      {state.token && state.workerId === workerId && (
        <div className="border border-[#D9EAD3] bg-[#F3F8F1] p-3 space-y-2">
          <p className="font-ui text-sm font-semibold">Worker #{workerId} 新令牌</p>
          <code className="block break-all select-all font-mono text-[12px] text-[#111]">
            {state.token}
          </code>
          <p className="font-meta text-[11px] text-[#5F6B5A]">
            离开或刷新本页后无法再次查看。旧令牌已立即失效。
          </p>
        </div>
      )}
    </div>
  );
}
