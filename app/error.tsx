'use client';

import Link from 'next/link';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[70dvh] flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="surface-panel max-w-md w-full p-8 sm:p-10 shadow-ink">
        <p className="font-meta mb-2 text-soft">Notice</p>
        <h1 className="section-title text-2xl sm:text-3xl text-ink">
          页面暂时遇到一点问题
        </h1>
        <p className="mt-3 font-ui text-sm text-soft leading-relaxed">
          服务器未能完成当前请求，请尝试重新加载或返回首页。
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="btn-ink cursor-pointer !text-[13px]"
          >
            重新加载
          </button>
          <Link href="/" className="btn-ghost !text-[13px]">
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
