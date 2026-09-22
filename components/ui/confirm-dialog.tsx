'use client';

import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const restoreRef = useRef<(() => void) | null>(null);
  const backdropPointerRef = useRef(false);

  // Close and restore synchronously, before a callback can submit an invalid form
  // and move focus to its first invalid field outside the modal.
  const close = useCallback(() => {
    const restore = restoreRef.current;
    if (!restore) return false;
    restoreRef.current = null;
    dialogRef.current?.close();
    restore();
    return true;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const invoker = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    restoreRef.current = () => {
      document.body.style.overflow = previousOverflow;
      if (invoker instanceof HTMLElement && invoker.isConnected) {
        invoker.focus({ preventScroll: true });
      }
    };
    cancelRef.current?.focus({ preventScroll: true });
    const content = contentRef.current;
    const measure = () => setScrollable(Boolean(content && content.scrollHeight > content.clientHeight));
    const resize = new ResizeObserver(measure);
    if (content) {
      resize.observe(content);
      // The message can change height without changing the constrained viewport.
      for (const child of content.children) resize.observe(child);
    }
    measure();
    return () => { resize.disconnect(); close(); };
  }, [open, close]);

  const cancel = () => {
    if (close()) onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onClose={() => {
        // Also synchronize an unexpected native close with the controlled state.
        if (!dialogRef.current?.open && close()) onCancel();
      }}
      onPointerDown={(event) => {
        backdropPointerRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && backdropPointerRef.current) cancel();
        backdropPointerRef.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex], [contenteditable="true"]',
        )).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        const active = document.activeElement;
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (event.shiftKey && (active === first || !controls.includes(active as HTMLElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !controls.includes(active as HTMLElement))) {
          event.preventDefault();
          first.focus();
        }
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[440px] overflow-visible border-0 bg-transparent p-0 text-ink backdrop:bg-black/45 backdrop:backdrop-blur-[3px] motion-safe:open:animate-fade-in"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
        <div
          ref={contentRef}
          tabIndex={scrollable ? 0 : undefined}
          role={scrollable ? 'region' : undefined}
          aria-labelledby={scrollable ? titleId : undefined}
          className="min-h-0 overflow-y-auto overscroll-contain px-5 pt-6 pb-5 sm:px-6 focus-visible:-outline-offset-2"
        >
          <div className={cn(
            'mb-4 flex size-10 items-center justify-center rounded-xl border',
            tone === 'danger' ? 'border-[hsl(var(--danger-border))] bg-[hsl(var(--danger-soft))] text-danger' : 'border-line bg-surface-2 text-ink',
          )} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6m0 4h.01" />
            </svg>
          </div>
          <h2 id={titleId} className="break-words font-ui text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <div id={descId} className="mt-2 whitespace-pre-wrap break-words font-ui text-sm leading-7 text-ink-soft [overflow-wrap:anywhere]">
            {message}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-line bg-surface-2/60 p-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            ref={cancelRef}
            type="button"
            onClick={cancel}
            className="inline-flex min-h-11 items-center justify-center whitespace-normal break-words rounded-xl border border-line bg-surface px-5 py-2 font-ui text-sm font-medium text-ink hover:bg-surface-2 motion-safe:transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => { if (close()) onConfirm(); }}
            className={cn(
              'inline-flex min-h-11 items-center justify-center whitespace-normal break-words rounded-xl border px-5 py-2 font-ui text-sm font-semibold motion-safe:transition-colors',
              tone === 'danger'
                ? 'border-[hsl(var(--danger-border))] bg-[hsl(var(--danger-soft))] text-danger hover:bg-[hsl(var(--danger)/0.15)]'
                : 'border-ink bg-ink text-surface hover:bg-ink/90',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
