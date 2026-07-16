'use client';

import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export function ConfirmSubmitButton({
  message,
  className,
  children,
  disabled,
  title = '请确认',
  confirmLabel = '确定',
  cancelLabel = '取消',
  tone = 'danger',
}: {
  message: string;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}) {
  const [open, setOpen] = useState(false);
  const [pendingForm, setPendingForm] = useState<HTMLFormElement | null>(null);

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={(event) => {
          if (disabled) return;
          const form = event.currentTarget.form;
          if (!form) return;
          setPendingForm(form);
          setOpen(true);
        }}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        tone={tone}
        onCancel={() => {
          setOpen(false);
          setPendingForm(null);
        }}
        onConfirm={() => {
          const form = pendingForm;
          setOpen(false);
          setPendingForm(null);
          if (form) {
            // Native submit bypasses the button path and runs the form action.
            if (typeof form.requestSubmit === 'function') {
              form.requestSubmit();
            } else {
              form.submit();
            }
          }
        }}
      />
    </>
  );
}
