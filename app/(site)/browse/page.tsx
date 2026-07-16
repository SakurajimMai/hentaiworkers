import Link from 'next/link';
import { Suspense } from 'react';
import { AnimeCard } from '@/components/AnimeCard';
import { Pagination } from '@/components/pagination';
import { listAnimes, type SortType } from '@/lib/anime-service';

export const dynamic = 'force-dynamic';

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const search = typeof sp.search === 'string' ? sp.search : undefined;
  const tagId = sp.tag ? parseInt(String(sp.tag), 10) : undefined;
  const tagName = typeof sp.tagName === 'string' ? sp.tagName : undefined;
  const sort: SortType = sp.sort === 'popular' ? 'popular' : 'latest';

  let data: Awaited<ReturnType<typeof listAnimes>> | null = null;
  let error: string | null = null;
  try {
    data = await listAnimes({
      page,
      limit: 48,
      search,
      tagId: Number.isFinite(tagId) ? tagId : undefined,
      sort,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : '加载失败';
  }

  const heading = search
    ? `「${search}」`
    : tagId
      ? tagName || '标签'
      : sort === 'popular'
        ? '热门'
        : '最近更新';

  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = {
      search,
      tag: tagId ? String(tagId) : undefined,
      tagName,
      sort: sort === 'popular' ? 'popular' : undefined,
      page: '1',
      ...next,
    };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) p.set(k, v);
    });
    const s = p.toString();
    return s ? `/browse?${s}` : '/browse';
  };

  return (
    <div className="pb-20 sm:pb-24">
      <div className="page-shell pt-8 sm:pt-12">
        <div className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-end gap-5 border-b border-[#ece8e0] pb-6">
          <div className="flex-1 min-w-0">
            <p className="font-meta mb-2">里番馆</p>
            <h1 className="section-title text-3xl sm:text-4xl text-ink">{heading}</h1>
            <p className="mt-2 font-ui text-sm text-soft leading-relaxed max-w-prose">
              里番内容与标签独立存储；动漫外链请前往{' '}
              <Link
                href="/works"
                className="text-ink font-medium underline underline-offset-2 decoration-[#d8d4cb] hover:decoration-[#1a1917]"
              >
                动漫馆
              </Link>
              。
            </p>
          </div>
          <div className="inline-flex items-center gap-0.5 rounded-full border border-[#e8e4dc] bg-white p-1 shadow-[0_1px_0_hsla(30,12%,18%,0.03)]">
            <Link
              href={qs({ sort: undefined })}
              className={`rounded-full px-3.5 py-1.5 font-ui text-[12px] font-medium transition-colors ${
                sort === 'latest' ? 'bg-[#1a1917] text-white' : 'text-soft hover:text-ink'
              }`}
            >
              最近更新
            </Link>
            <Link
              href={qs({ sort: 'popular' })}
              className={`rounded-full px-3.5 py-1.5 font-ui text-[12px] font-medium transition-colors ${
                sort === 'popular' ? 'bg-[#1a1917] text-white' : 'text-soft hover:text-ink'
              }`}
            >
              热门
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-4 font-ui text-sm text-[#9F2F2D]">
            加载失败：{error}
          </div>
        )}

        {data && data.data.length === 0 && (
          <div className="empty-state">
            <p className="font-meta mb-2">Empty</p>
            <p className="section-title text-2xl text-ink">没有找到相关里番</p>
            <p className="mt-2 font-ui text-sm text-soft">试试换个关键词，或浏览全部上架内容。</p>
            <Link href="/browse" className="btn-ink inline-flex mt-5">
              返回里番馆
            </Link>
          </div>
        )}

        {data && data.data.length > 0 && (
          <>
            <p className="font-meta mb-5 normal-case tracking-normal">
              第 {data.pagination.page} / {data.pagination.totalPages} 页 · {data.data.length} 部
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 gap-y-7 sm:gap-x-4">
              {data.data.map((anime) => (
                <AnimeCard key={anime.id} anime={anime} />
              ))}
            </div>
            <div className="flex justify-center pt-12">
              <Suspense fallback={null}>
                <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} />
              </Suspense>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
