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
        : '最新';

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
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 sm:pt-12">
        <div className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-end gap-5 border-b border-[#EAEAEA] pb-6">
          <div className="flex-1 min-w-0">
            <p className="font-meta mb-2">Catalog</p>
            <h1 className="font-serif text-3xl sm:text-4xl text-[#111]">{heading}</h1>
          </div>
          <div className="inline-flex items-center gap-0 border border-[#EAEAEA] rounded-sm bg-white p-0.5">
            <Link
              href={qs({ sort: undefined })}
              className={`rounded-sm px-3.5 py-1.5 font-ui text-[12px] font-medium ${
                sort === 'latest' ? 'bg-[#111] text-white' : 'text-[#787774]'
              }`}
            >
              最新
            </Link>
            <Link
              href={qs({ sort: 'popular' })}
              className={`rounded-sm px-3.5 py-1.5 font-ui text-[12px] font-medium ${
                sort === 'popular' ? 'bg-[#111] text-white' : 'text-[#787774]'
              }`}
            >
              热门
            </Link>
          </div>
        </div>

        {error && (
          <div className="surface-card px-4 py-6 text-sm text-[#787774]">加载失败：{error}</div>
        )}

        {data && data.data.length === 0 && (
          <div className="py-16 text-center font-ui text-[#787774]">没有找到相关作品</div>
        )}

        {data && data.data.length > 0 && (
          <>
            <p className="font-meta mb-5">
              Page {data.pagination.page} / {data.pagination.totalPages} · {data.data.length} titles
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
