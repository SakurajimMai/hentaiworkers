'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Direct-eye reveal: no re-auth; auto-hide after 30s.
 */
export function SecretEye({ secretId }: { secretId: number }) {
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hide = useCallback(() => {
    setPlaintext(null);
  }, []);

  useEffect(() => {
    if (!plaintext) return;
    const t = setTimeout(hide, 30_000);
    return () => clearTimeout(t);
  }, [plaintext, hide]);

  async function reveal() {
    if (plaintext) {
      hide();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/crawler/secrets/${secretId}/reveal`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const body = (await res.json()) as {
        plaintext?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(body.error?.message ?? '揭示失败');
        return;
      }
      setPlaintext(body.plaintext ?? '');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={reveal}
        className="font-ui text-[12px] underline underline-offset-2"
        disabled={loading}
      >
        {loading ? '…' : plaintext ? '隐藏' : '查看'}
      </button>
      {plaintext != null && (
        <code className="font-mono text-[12px] break-all bg-white border border-[#EAEAEA] px-2 py-1 rounded">
          {plaintext}
        </code>
      )}
      {error && <span className="text-[12px] text-[#C5221F]">{error}</span>}
    </div>
  );
}
