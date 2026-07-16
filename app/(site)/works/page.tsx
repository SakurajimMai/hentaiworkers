import Link from 'next/link';
import { getWorksQueryService } from '@/lib/server/works';
import { PosterPlaceholder } from '@/components/poster-placeholder';

export const dynamic = 'force-dynamic';

export default async function WorksBrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const search = typeof sp.search === 'string' ? sp.search : undefined;
  const source = typeof sp.source === 'string' ? sp.source : undefined;

  let data: Awaited<ReturnType<ReturnType<typeof getWorksQueryService>['list']>> | null =
    null;
  let error: string | null = null;
  try {
    data = await getWorksQueryService().list({
      page,
      limit: 48,
      search,
      source,
      activeOnly: true,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : '加载失败';
  }

  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = {
      search,
      source,
      page: '1',
      ...next,
    };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) p.set(k, v);
    });
    const s = p.toString();
    return s ? `/works?${s}` : '/works';
  };

  return (
    <div className="page-shell py-8 sm:py-10 pb-20 space-y-8">
      <div className="space-y-2 max-w-2xl">
        <p className="font-meta">动漫馆</p>
        <h1 className="section-title text-3xl sm:text-4xl text-ink">动漫馆</h1>
        <p className="font-ui text-sm text-soft leading-relaxed">
          资源站动漫外链（m3u8）与独立标签字典；与里番馆分表存储，本站不下载视频。里番请前往{' '}
          <Link
            href="/browse"
            className="text-ink font-medium underline underline-offset-2 decoration-[#d8d4cb] hover:decoration-[#1a1917]"
          >
            里番馆
          </Link>
          。
        </p>
      </div>

      <form
        className="surface-card p-3 sm:p-4 flex flex-col sm:flex-row flex-wrap gap-2"
        action="/works"
        method="get"
      >
        <input
          name="search"
          defaultValue={search ?? ''}
          placeholder="搜索标题"
          className="admin-input sm:max-w-sm"
        />
        <button type="submit" className="btn-ink !text-[13px]">
          搜索
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-3 font-ui text-[13px] text-[#9F2F2D]">
          加载失败：{error}
        </div>
      )}

      {data && (
        <>
          <p className="font-meta text-[12px] normal-case tracking-normal text-[#6f6d68]">
            共 {data.total} 部 · 第 {data.page}/{data.totalPages} 页
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5 items-stretch">
            {data.data.map((work) => {
              const metaParts = [
                work.remarks || null,
                work.releaseYear ? String(work.releaseYear) : null,
              ].filter(Boolean);
              return (
                <Link key={work.id} href={`/works/${work.id}`} className="group flex h-full">
                  <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[#e8e4dc] bg-white shadow-[0_1px_0_hsla(30,12%,18%,0.03)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-ink">
                    <div className="relative w-full shrink-0 aspect-[2/3] overflow-hidden bg-[#f0eee9]">
                      {work.coverUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={work.coverUrl}
                            alt={work.title}
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1a1917]/30 via-transparent to-transparent opacity-80" />
                        </>
                      ) : (
                        <PosterPlaceholder title={work.title} />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3.5 min-h-[4.5rem]">
                      <p
                        className="font-ui text-[13px] font-medium text-ink line-clamp-2 leading-snug min-h-[2.4em]"
                        title={work.title}
                      >
                        {work.title}
                      </p>
                      {metaParts.length > 0 && (
                        <p className="mt-auto pt-1.5 font-meta text-[11px] normal-case tracking-normal text-[#8a877f] line-clamp-1">
                          {metaParts.join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {data.data.length === 0 && (
            <div className="empty-state">
              <p className="font-meta mb-2">Empty</p>
              <p className="section-title text-2xl text-ink">暂无上架的外链作品</p>
              <p className="mt-2 font-ui text-sm text-soft">
                管理员可在后台启动 MacCMS 采集任务，或稍后再来。
              </p>
              <Link href="/browse" className="btn-ghost inline-flex mt-5">
                去里番馆
              </Link>
            </div>
          )}
          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              {page > 1 && (
                <Link href={qs({ page: String(page - 1) })} className="btn-ghost !text-[13px]">
                  上一页
                </Link>
              )}
              {page < data.totalPages && (
                <Link href={qs({ page: String(page + 1) })} className="btn-ghost !text-[13px]">
                  下一页
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
