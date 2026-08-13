import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { MangaCard } from '@/components/MangaCard';
import { getManga, isMangaEnabled, listMangas } from '@/lib/manga-client';
import { MediaImage } from '@/components/media-image';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { IconArrowLeft, IconPlay } from '@/components/icons';
import { StructuredData } from '@/components/structured-data';
import { resolveSiteUrl } from '@/lib/site-url';
import { getIdentityService } from '@/lib/server/identity';
import { isMangaFavorite } from '@/lib/server/manga-favorites';
import { MangaFavoriteButton } from '@/components/manga-favorite-button';

export const revalidate = 60;

type Params = Promise<{ slug: string }>;

function formatDate(value: Date | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!(await isMangaEnabled())) return { title: '漫画未开放', robots: { index: false, follow: false } };
  const manga = await getManga(slug);
  if (!manga) return { title: '漫画不存在', robots: { index: false, follow: false } };
  const description = manga.description?.replace(/\s+/g, ' ').trim()
    || `阅读 ${manga.title}，共 P${manga.pageCount}。`;
  return {
    title: manga.title,
    description: description.slice(0, 160),
    authors: manga.author ? [{ name: manga.author }] : undefined,
    keywords: manga.tags.length ? manga.tags : undefined,
    alternates: { canonical: `/manga/${manga.id}` },
    openGraph: {
      title: manga.title,
      description: description.slice(0, 160),
      type: 'article',
      url: `/manga/${manga.id}`,
      images: manga.coverUrl ? [{ url: manga.coverUrl, alt: manga.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: manga.title,
      description: description.slice(0, 160),
    },
  };
}

export default async function MangaDetailPage({ params }: { params: Params }) {
  const { slug } = await params;

  if (!(await isMangaEnabled())) {
    notFound();
  }

  const manga = await getManga(slug);
  if (!manga) notFound();
  if (slug !== String(manga.id)) permanentRedirect(`/manga/${manga.id}`);

  const firstChapter = manga.chapters[0]?.number;
  const user = await getIdentityService().getCurrentUser();
  const favorited = user ? await isMangaFavorite(manga.id) : false;
  let recommendations: Awaited<ReturnType<typeof listMangas>>['data'] = [];
  try {
    const result = await listMangas({
      page: 1,
      limit: 7,
      tag: manga.tags[0],
    });
    recommendations = result.data.filter((item) => item.id !== manga.id).slice(0, 6);
    if (recommendations.length < 3) {
      const latest = await listMangas({ page: 1, limit: 7 });
      const seen = new Set(recommendations.map((item) => item.id));
      for (const item of latest.data) {
        if (item.id === manga.id || seen.has(item.id)) continue;
        recommendations.push(item);
        if (recommendations.length >= 6) break;
      }
    }
  } catch {
    // The work page remains usable if recommendations are temporarily unavailable.
  }

  return (
    <div className="page-shell py-7 sm:py-11 pb-20">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'Book',
          name: manga.title,
          description: manga.description || undefined,
          image: manga.coverUrl || undefined,
          numberOfPages: manga.pageCount,
          url: `${resolveSiteUrl(process.env.SITE_URL)}/manga/${manga.id}`,
          author: manga.author ? { '@type': 'Person', name: manga.author } : undefined,
          keywords: manga.tags.length ? manga.tags.join(', ') : undefined,
          dateModified: manga.updatedAt ? new Date(manga.updatedAt).toISOString() : undefined,
          isPartOf: { '@type': 'CollectionPage', name: 'AnimeStream 漫画目录' },
        }}
      />
      <Link href="/manga" className="mb-7 inline-flex items-center gap-1.5 font-ui text-[12px] text-soft transition hover:text-ink">
        <IconArrowLeft size={15} /> 漫画目录
      </Link>

      <div className="grid gap-7 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-10 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-14">
        <div className="mx-auto w-[min(48vw,190px)] shrink-0 sm:mx-0 sm:w-full lg:w-[230px]">
          <div className="poster-frame overflow-hidden rounded-2xl border border-border shadow-ink">
            <AspectRatio ratio={2 / 3}>
              <MediaImage
                src={manga.coverUrl}
                alt={manga.title}
                width={400}
                height={600}
                sizes="(max-width: 640px) 48vw, 230px"
                className="h-full w-full object-cover"
                variant="poster"
              />
            </AspectRatio>
          </div>
        </div>

        <div className="min-w-0 self-center">
          <p className="font-meta mb-3">作品详情</p>
          <h1 className="section-title max-w-3xl text-3xl text-ink sm:text-4xl lg:text-5xl">{manga.title}</h1>
          {manga.author && (
            <p className="mt-4 font-ui text-[13px] text-soft">作者：<span className="font-medium text-ink">{manga.author}</span></p>
          )}
          {manga.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2" aria-label="漫画标签">
              {manga.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/manga?tag=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-border bg-card px-2.5 py-1 font-ui text-[11px] text-soft transition-colors hover:border-ink/20 hover:bg-secondary hover:text-ink"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
          {manga.description && (
            <p className="mt-5 max-w-2xl whitespace-pre-wrap font-ui text-[14px] leading-relaxed text-soft">
              {manga.description}
            </p>
          )}
          <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3 border-y border-border py-4">
            <div>
              <p className="font-meta text-[10px]">内容</p>
              <p className="mt-1 font-ui text-[14px] font-medium text-ink">P{manga.pageCount || '—'}</p>
            </div>
            <div>
              <p className="font-meta text-[10px]">更新</p>
              <p className="mt-1 font-ui text-[14px] font-medium text-ink">{formatDate(manga.updatedAt)}</p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {firstChapter != null && (
              <Link
                href={`/manga/${manga.id}/read/${firstChapter}`}
                className="btn-ink inline-flex min-h-11 !rounded-xl !px-5"
              >
                <IconPlay size={13} />
                开始阅读
              </Link>
            )}
            <MangaFavoriteButton
              mangaId={manga.id}
              favorited={favorited}
              returnTo={`/manga/${manga.id}`}
            />
          </div>
        </div>
      </div>

      {recommendations.length > 0 && (
        <section className="mt-14 border-t border-border pt-8 sm:mt-20 sm:pt-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="font-meta mb-2">继续浏览</p>
              <h2 className="section-title text-2xl text-ink sm:text-3xl">推荐内容</h2>
            </div>
            <Link href="/manga" className="font-ui text-[12px] text-soft transition hover:text-ink">
              查看全部
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-10 md:grid-cols-4 lg:grid-cols-6">
            {recommendations.map((item) => (
              <MangaCard
                key={item.id}
                manga={{
                  id: item.id,
                  title: item.title,
                  coverUrl: item.coverUrl,
                  pageCount: item.pageCount,
                }}
              />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
