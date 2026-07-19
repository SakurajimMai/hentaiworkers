'use client';

import { useFormStatus } from 'react-dom';

export function ProfileSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn-ink" disabled={pending}>
      {pending ? '保存中…' : label}
    </button>
  );
}
