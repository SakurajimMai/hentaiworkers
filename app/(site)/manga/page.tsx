import { getSiteSeo } from '@/lib/server/site-metadata';
import Link from 'next/link';
import { Suspense, cache, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { MangaCard } from '@/components/MangaCard';
import { Pagination } from '@/components/pagination';
import { isCuratedMangaTag, isMangaEnabled, listMangas } from '@/lib/manga-client';
import { MANGA_CATALOG_PAGE_SIZE } from '@/lib/manga-service';
import { normalizeMangaTagQuery } from '@/lib/manga-tags';
import { isMangaRank } from '@/lib/manga-views';
import { buildMangaListHref } from '@/components/manga-pagination';
import { StructuredData } from '@/components/structured-data';
import { FeedAdCard } from '@/components/feed-ad-card';
import { followOnlyRobots, indexableRobots, pageOpenGraph, siteOrigin } from '@/lib/seo';
import { interleaveFeedAds } from '@/lib/server/system/domain/ads-settings-form';
import { htmlAdDocumentPath } from '@/lib/html-ad-document';
import { getSystemSettingsService } from '@/lib/server/system';

export const revalidate = 60;

type SearchParams = Promise<{ page?: string; q?: string; tag?: string; rank?: string }>;

const RANKS = [
  { id: '', label: '最近更新' },
  { id: 'day', label: '日榜' },
  { id: 'week', label: '周榜' },
  { id: 'month', label: '月榜' },
  { id: 'all', label: '总榜' },
] as const;

/** Shared between generateMetadata and the page body so the listing is queried once per request. */
const loadMangaPage = cache((page: number, q: string, tag: string, rank: string) =>
  listMangas({
    page,
    limit: MANGA_CATALOG_PAGE_SIZE,
    q: q || undefined,
    tag: tag || undefined,
    rank: isMangaRank(rank) ? rank : undefined,
  }));

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const q = (sp.q || '').trim();
  const tag = normalizeMangaTagQuery(sp.tag);
  const rank = isMangaRank(sp.rank) ? sp.rank : undefined;
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const rankLabel = rank === 'day' ? '日榜' : rank === 'week' ? '周榜' : rank === 'month' ? '月榜' : rank === 'all' ? '总榜' : '';
  const pageSuffix = page > 1 ? `（第 ${page} 页）` : '';
  const title = tag
    ? `漫画标签：${tag}${pageSuffix}`
    : q
      ? `搜索漫画：${q}`
      : rankLabel
        ? `漫画${rankLabel}${pageSuffix}`
        : `漫画目录${pageSuffix}`;
  const seo = await getSiteSeo().catch(() => ({ title: 'AnimeStream', subtitle: '里番与漫画' }));
  const brand = seo.title || 'AnimeStream';
  const description = tag
    ? `浏览 ${brand} 漫画标签「${tag}」下的作品。漫画标签独立于里番标签。`
    : q
      ? `在 ${brand} 中搜索包含“${q}”的漫画作品。`
      : `浏览 ${brand} 已发布漫画，按标题或漫画标签查找作品。`;
  // Paginated listings canonicalise to themselves so crawlers reach every page of the catalog.
  const canonical = buildMangaListHref(page, undefined, tag || undefined, rank);
  // A page past the end renders an empty grid, so it must not be offered as its own landing page.
  const withinRange =
    page === 1 ||
    (await loadMangaPage(page, q, tag, rank ?? '')
      .then((data) => page <= Math.max(1, data.totalPages))
      .catch(() => false));
  // Free-form crawler tags would create thousands of thin pages; only curated tags are landing pages.
  const indexable = !q && (!tag || (await isCuratedMangaTag(tag))) && withinRange;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: pageOpenGraph({
      siteName: brand,
      title,
      description,
      type: 'website',
      url: canonical,
      images: [{ url: '/opengraph-image', alt: brand }],
    }),
    robots: indexable ? indexableRobots : followOnlyRobots,
  };
}

export default async function MangaListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const q = (sp.q || '').trim();
  const tag = normalizeMangaTagQuery(sp.tag);
  const rank = isMangaRank(sp.rank) ? sp.rank : undefined;

  const enabled = await isMangaEnabled();
  if (!enabled) {
    return (
      <div className="page-shell py-12 sm:py-16">
        <header className="max-w-2xl mb-10">
          <p className="font-meta mb-3">漫画</p>
          <h1 className="section-title text-3xl sm:text-4xl text-ink">漫画暂未开放</h1>
          <p className="mt-3.5 font-ui text-[15px] text-soft leading-relaxed">
            管理员可在后台「系统设置」中启用漫画栏目。
          </p>
        </header>
      </div>
    );
  }

  let data: Awaited<ReturnType<typeof listMangas>> | null = null;
  let hasError = false;
  try {
    data = await loadMangaPage(page, q, tag, rank ?? '');
  } catch {
    hasError = true;
  }

  const heading = tag ? tag : q ? `「${q}」` : '漫画';

  const siteUrl = siteOrigin();
  const listPath = buildMangaListHref(page, undefined, tag || undefined, rank);

  const siteTitle = (await getSiteSeo().catch(() => ({ title: 'AnimeStream' }))).title || 'AnimeStream';

  return (
    <div className="page-shell max-w-6xl py-8 sm:py-12 pb-20">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: heading,
          description: tag
            ? `漫画标签「${tag}」`
            : `${siteTitle} 已发布漫画目录。`,
          url: `${siteUrl}${listPath}`,
        }}
      />
      <header className="mb-8 border-b border-border pb-7 sm:mb-10 sm:pb-9">
        {tag ? <p className="font-meta mb-3">漫画标签</p> : null}
        <h1 className="section-title text-4xl text-ink sm:text-5xl">{heading}</h1>
        {(tag || q) && (
          <p className="mt-4">
            <Link href="/manga" className="font-ui text-[13px] text-soft transition hover:text-ink">
              查看全部漫画
            </Link>
          </p>
        )}
        <nav className="mt-6 flex flex-wrap gap-1.5" aria-label="漫画榜单">
          {RANKS.map((item) => {
            const active = (item.id || undefined) === rank;
            return (
              <Link
                key={item.id || 'latest'}
                href={buildMangaListHref(1, q || undefined, tag || undefined, item.id || undefined)}
                className={
                  active
                    ? 'rounded-full bg-ink px-3.5 py-1.5 font-ui text-[12px] font-medium text-background'
                    : 'rounded-full border border-border bg-card px-3.5 py-1.5 font-ui text-[12px] text-soft transition hover:border-line hover:bg-secondary hover:text-ink'
                }
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {hasError && (
        <div className="mb-8 notice-error !text-sm">
          漫画内容暂时无法加载，请稍后刷新重试。
        </div>
      )}

      {!hasError && data && data.data.length === 0 && (
        <div className="surface-panel max-w-2xl px-6 py-12 text-center sm:px-10">
          <p className="font-meta mb-3">没有找到作品</p>
          <h2 className="section-title text-2xl text-ink">
            {tag ? '这个漫画标签还没有作品' : '换个标题试试'}
          </h2>
          <p className="mx-auto mt-3 max-w-md font-ui text-[13px] leading-relaxed text-soft">
            {tag
              ? '漫画标签与里番标签互不相通，这里只列出带有该漫画标签的作品。'
              : q
                ? '没有匹配的漫画标题、作者或漫画标签，可以清除搜索条件查看全部内容。'
                : '作品发布后会自动出现在这里。'}
          </p>
          {(q || tag) && (
            <Link href="/manga" className="btn-ink mt-6 inline-flex !rounded-xl !text-[13px]">
              查看全部
            </Link>
          )}
        </div>
      )}

      {data && data.data.length > 0 && (
        <MangaCatalogGrid
          items={data.data}
          pagination={
            data.totalPages > 1 ? (
              <div className="flex justify-center pt-12">
                <Suspense fallback={null}>
                  <Pagination page={data.page} totalPages={data.totalPages} />
                </Suspense>
              </div>
            ) : null
          }
        />
      )}
    </div>
  );
}

async function MangaCatalogGrid({
  items,
  pagination,
}: {
  items: Array<{
    id: number;
    title: string;
    coverUrl?: string | null;
    pageCount?: number | null;
  }>;
  pagination: ReactNode;
}) {
  const ads = (await getSystemSettingsService().getPublicAdsConfig()).feedSlots;
  const slots = interleaveFeedAds(items, ads, (item) => String(item.id));

  return (
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
              documentSrc={htmlAdDocumentPath({ kind: 'feed', id: slot.adIndex })}
            />
          ) : (
            <MangaCard
              key={slot.key}
              manga={{
                id: slot.item.id,
                title: slot.item.title,
                coverUrl: slot.item.coverUrl,
                pageCount: slot.item.pageCount,
              }}
            />
          ),
        )}
      </div>
      {pagination}
    </>
  );
}
