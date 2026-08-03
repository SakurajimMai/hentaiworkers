import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <div className="page-shell flex flex-1 flex-col items-center justify-center py-20 sm:py-28 text-center">
        <p className="font-meta mb-3">404</p>
        <h1 className="section-title text-3xl sm:text-5xl text-ink max-w-lg">
          找不到这个页面
        </h1>
        <p className="mt-4 max-w-md font-ui text-[15px] leading-relaxed text-soft">
          链接可能已失效，或内容已下架。你可以回到首页，或去浏览页继续看里番。
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <Link href="/" className="btn-ink">
            返回首页
          </Link>
          <Link href="/browse" className="btn-ghost">
            浏览
          </Link>
        </div>
      </div>
    </div>
  );
}
