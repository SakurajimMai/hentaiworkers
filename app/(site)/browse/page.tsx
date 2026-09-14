import Link from 'next/link';
import type { Metadata } from 'next';
import { Suspense, cache } from 'react';
import { AnimeCard } from '@/components/AnimeCard';
import { IconClock, IconTrendingUp } from '@/components/icons';
import { FeedAdCard } from '@/components/feed-ad-card';
import { Pagination } from '@/components/pagination';
import { BROWSE_CATALOG_PAGE_SIZE, listAnimes, listTags, type SortType } from '@/lib/anime-service';
import { StructuredData } from '@/components/structured-data';
import { followOnlyRobots, indexableRobots, pageOpenGraph, siteOrigin } from '@/lib/seo';
import { FEED_BANNER_GRID_CLASS, interleaveFeedAds, isFeedBannerAd } from '@/lib/server/system/domain/ads-settings-form';
import { htmlAdDocumentPath } from '@/lib/html-ad-document';
import { getSystemSettingsService } from '@/lib/server/system';

export const revalidate = 60;

type BrowseSearchParams = Record<string, string | string[] | undefined>;

function parseTagId(sp: BrowseSearchParams): number | undefined {
  const raw = typeof sp.tag === 'string' ? sp.tag : Array.isArray(sp.tag) ? sp.tag[0] : undefined;
  const id = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

/**
 * Resolve the human name from the id alone. `?tagName=` is never trusted: it decides the title,
 * the description and the JSON-LD, so honouring it would let any URL mint an indexable page for a
 * tag that does not exist. `cache` keeps metadata and the page body to a single lookup per request.
 */
const resolveTagName = cache(async (tagId: number | undefined): Promise<string> => {
  if (!tagId) return '';
  try {
    return (await listTags()).find((tag) => tag.id === tagId)?.name ?? '';
  } catch (error) {
    console.error('resolveTagName failed', error);
    return '';
  }
});

/** Listing data is read by both generateMetadata and the page; share one query per request. */
const loadBrowsePage = cache((page: number, search: string, tagId: number, sort: SortType) =>
  listAnimes({
    page,
    limit: BROWSE_CATALOG_PAGE_SIZE,
    search: search || undefined,
    tagId: tagId > 0 ? tagId : undefined,
    sort,
  }));

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<BrowseSearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const search = typeof sp.search === 'string' ? sp.search.trim() : '';
  const tagId = parseTagId(sp);
  const tag = await resolveTagName(tagId);
  const popular = sp.sort === 'popular';
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const pageSuffix = page > 1 ? `（第 ${page} 页）` : '';
  const title = search
    ? `搜索：${search}`
    : tag
      ? `${tag} · 里番${pageSuffix}`
      : popular
        ? `热门里番${pageSuffix}`
        : `最近更新里番${pageSuffix}`;
  const description = search
    ? `在 AnimeStream 中搜索包含“${search}”的里番视频。`
    : tag
      ? `浏览 AnimeStream 的「${tag}」标签作品。`
      : popular
        ? '浏览 AnimeStream 里番片库中近期受欢迎的作品。'
        : '浏览 AnimeStream 里番片库的最近更新内容。';
  const query = new URLSearchParams();
  if (tagId) query.set('tag', String(tagId));
  if (popular) query.set('sort', 'popular');
  if (page > 1) query.set('page', String(page));
  const canonical = query.toString() ? `/browse?${query.toString()}` : '/browse';
  // A page past the end renders an empty grid, so it must not be offered as its own landing page.
  const withinRange =
    page === 1 ||
    (await loadBrowsePage(page, search, tagId ?? 0, popular ? 'popular' : 'latest')
      .then((data) => page <= Math.max(1, data.pagination.totalPages))
      .catch(() => false));
  // A tag id that no longer exists must not compete with the catalog page in the index.
  const indexable = !search && (!tagId || Boolean(tag)) && withinRange;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: pageOpenGraph({
      title,
      description,
      type: 'website',
      url: canonical,
      images: [{ url: '/opengraph-image', alt: 'AnimeStream' }],
    }),
    robots: indexable ? indexableRobots : followOnlyRobots,
  };
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<BrowseSearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(String(sp.page || '1'), 10) || 1);
  const search = typeof sp.search === 'string' ? sp.search.trim() : '';
  const tagId = parseTagId(sp);
  const tagName = (await resolveTagName(tagId)) || undefined;
  const sort: SortType = sp.sort === 'popular' ? 'popular' : 'latest';

  let data: Awaited<ReturnType<typeof listAnimes>> | null = null;
  let error: string | null = null;
  try {
    data = await loadBrowsePage(page, search, tagId ?? 0, sort);
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
            description: tagName
              ? `AnimeStream「${tagName}」标签下的里番作品。`
              : 'AnimeStream 里番视频目录，支持按标题、标签和热门程度浏览。',
            url: `${siteOrigin()}${page > 1 ? qs({ page: String(page) }) : '/browse'}`,
          }}
        />
        <div className="mb-8 sm:mb-10 flex flex-col sm:flex-row sm:items-end gap-5 border-b border-border pb-6">
          <div className="flex-1 min-w-0">
            <h1 className="section-title text-3xl sm:text-4xl text-ink">{heading}</h1>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
            <Link
              href={qs({ sort: undefined })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-ui text-[12px] font-medium transition-all ${
                sort === 'latest' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-soft hover:text-ink hover:bg-secondary'
              }`}
            >
              <IconClock size={13} />
              最近更新
            </Link>
            <Link
              href={qs({ sort: 'popular' })}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-ui text-[12px] font-medium transition-all ${
                sort === 'popular' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-soft hover:text-ink hover:bg-secondary'
              }`}
            >
              <IconTrendingUp size={13} />
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
          <div className="surface-panel max-w-xl mx-auto px-6 py-12 text-center sm:px-10">
            <p className="font-meta mb-2 text-soft">Catalog</p>
            <p className="section-title text-2xl text-ink">没有找到相关里番</p>
            <p className="mt-2 font-ui text-sm text-soft leading-relaxed">试试换个关键词，或浏览全部上架内容。</p>
            <div className="mt-6 flex justify-center">
              <Link href="/browse" className="btn-ink inline-flex">
                返回里番馆
              </Link>
            </div>
          </div>
        )}

        {data && data.data.length > 0 && slots && (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-5 md:gap-y-8">
              {slots.map((slot) =>
                slot.type === 'ad' ? (
                  <FeedAdCard
                    key={slot.key}
                    html={slot.ad.html}
                    href={slot.ad.href}
                    width={slot.ad.width}
                    height={slot.ad.height}
                    banner={isFeedBannerAd(slot.ad)}
                    documentSrc={htmlAdDocumentPath({ kind: 'feed', id: slot.adIndex })}
                    className={isFeedBannerAd(slot.ad) ? FEED_BANNER_GRID_CLASS : undefined}
                  />
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
