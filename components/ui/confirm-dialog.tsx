'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ConfirmDialog({
  open,
  title = '请确认',
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => cancelRef.current?.focus(), 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-[#0a0a0a]/45 backdrop-blur-[2px] animate-fade-in"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-[1] w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#161616] text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] animate-fade-in"
      >
        <div className="px-6 pt-6 pb-2">
          <p id={titleId} className="font-ui text-[15px] font-semibold tracking-tight">
            {title}
          </p>
          <div
            id={descId}
            className="mt-2 font-ui text-[13.5px] leading-relaxed text-white/70 whitespace-pre-wrap"
          >
            {message}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center justify-center rounded-full border border-white/20 bg-transparent px-4 font-ui text-[13px] font-medium text-white/90 transition hover:bg-white/10 active:scale-[0.98]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'inline-flex h-9 items-center justify-center rounded-full px-4 font-ui text-[13px] font-medium transition active:scale-[0.98]',
              tone === 'danger'
                ? 'bg-[#e8e8e8] text-[#111] hover:bg-white'
                : 'bg-white text-[#111] hover:bg-white/90',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
