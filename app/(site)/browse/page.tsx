import Link from 'next/link';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AnimeCard } from '@/components/AnimeCard';
import { FeedAdCard } from '@/components/feed-ad-card';
import { Pagination } from '@/components/pagination';
import { listAnimes, type SortType } from '@/lib/anime-service';
import { StructuredData } from '@/components/structured-data';
import { interleaveFeedAds } from '@/lib/server/system/domain/ads-settings-form';
import { getSystemSettingsService } from '@/lib/server/system';

export const revalidate = 60;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const search = typeof sp.search === 'string' ? sp.search.trim() : '';
  const tag = typeof sp.tagName === 'string' ? sp.tagName.trim() : '';
  const popular = sp.sort === 'popular';
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const title = search ? `搜索：${search}` : tag ? `${tag} · 里番` : popular ? '热门里番' : '最近更新里番';
  const description = search
    ? `在 AnimeStream 中搜索包含“${search}”的里番视频。`
    : tag
      ? `浏览 AnimeStream 的「${tag}」标签作品。`
      : popular
        ? '浏览 AnimeStream 里番片库中近期受欢迎的作品。'
        : '浏览 AnimeStream 里番片库的最近更新内容。';
  const query = new URLSearchParams();
  if (sp.tag) query.set('tag', String(sp.tag));
  if (popular) query.set('sort', 'popular');
  if (page > 1) query.set('page', String(page));
  const canonical = query.toString() ? `/browse?${query.toString()}` : '/browse';
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonical,
      images: [{ url: '/opengraph-image', alt: 'AnimeStream' }],
    },
    robots: search ? { index: false, follow: true } : { index: true, follow: true },
  };
}

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
      limit: 40,
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

  const feedSlots = data && data.data.length > 0
    ? (await getSystemSettingsService().getPublicAdsConfig()).feedSlots
    : [];
  const slots = data
    ? interleaveFeedAds(data.data, feedSlots, (item) => String(item.id))
    : null;

  return (
    <div className="pb-20 sm:pb-24">
      <div className="page-shell max-w-6xl pt-8 sm:pt-12">
        <StructuredData
          data={{
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `${heading} · AnimeStream`,
            description: 'AnimeStream 里番视频目录，支持按标题、标签和热门程度浏览。',
            url: `${process.env.SITE_URL || ''}${page > 1 ? qs({ page: String(page) }) : '/browse'}`,
          }}
        />
        <div className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-end gap-5 border-b border-border pb-6">
          <div className="flex-1 min-w-0">
            <h1 className="section-title text-3xl sm:text-4xl text-ink">{heading}</h1>
          </div>
          <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-1 shadow-ink">
            <Link
              href={qs({ sort: undefined })}
              className={`rounded-full px-3.5 py-1.5 font-ui text-[12px] font-medium transition-colors ${
                sort === 'latest' ? 'bg-ink text-background' : 'text-soft hover:text-ink'
              }`}
            >
              最近更新
            </Link>
            <Link
              href={qs({ sort: 'popular' })}
              className={`rounded-full px-3.5 py-1.5 font-ui text-[12px] font-medium transition-colors ${
                sort === 'popular' ? 'bg-ink text-background' : 'text-soft hover:text-ink'
              }`}
            >
              热门
            </Link>
          </div>
        </div>

        {error && (
          <div className="notice-error !text-sm !py-4">
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

        {data && data.data.length > 0 && slots && (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-5 md:gap-y-8">
              {slots.map((slot) =>
                slot.type === 'ad' ? (
                  <FeedAdCard key={slot.key} html={slot.ad.html} href={slot.ad.href} />
                ) : (
                  <AnimeCard key={slot.key} anime={slot.item} />
                ),
              )}
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
