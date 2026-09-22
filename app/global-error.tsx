'use client';

export default function RootGlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh flex items-center justify-center bg-[#0F0F23] text-[#F8FAFC] p-4 font-sans">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-md">
          <h1 className="text-xl font-semibold mb-2">服务遇到暂时问题</h1>
          <p className="text-sm text-white/70 mb-6 leading-relaxed">
            页面加载异常，请尝试刷新重试。
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="cursor-pointer rounded-full bg-white text-black px-5 py-2 text-sm font-medium transition hover:bg-white/90 active:scale-95"
          >
            重新加载
          </button>
        </div>
      </body>
    </html>
  );
}
