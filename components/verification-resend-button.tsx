'use client';

import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

export function VerificationResendButton({ retryAt, initialSeconds }: { retryAt: number; initialSeconds: number }) {
  const { pending } = useFormStatus();
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  return (
    <button type="submit" className="btn-ghost disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || remaining > 0}>
      {pending ? '发送中…' : remaining > 0 ? `${remaining}s 后可重新发送` : '重新发送验证码'}
    </button>
  );
}
