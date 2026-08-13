import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AnimeCard } from '@/components/AnimeCard';
import { FavoriteButton } from '@/components/favorite-button';
import { IconArrowLeft, IconCalendar, IconEye } from '@/components/icons';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { WatchPlayer } from '@/components/watch-player';
import { getAnimeById, getSimilarAnimes } from '@/lib/anime-service';
import {
  getFavoritesService,
  getIdentityService,
  getWatchProgressService,
} from '@/lib/server/identity';
import { getSystemSettingsService } from '@/lib/server/system';
import { StructuredData } from '@/components/structured-data';
import { MediaImage } from '@/components/media-image';
import { resolveSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) return { title: '作品不存在' };
  const anime = await getAnimeById(id);
  if (!anime) return { title: '作品不存在', robots: { index: false, follow: false } };
  const description = anime.description?.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
    || `在线观看 ${anime.title}，支持播放进度同步与收藏。`;
  return {
    title: anime.title,
    description: description.slice(0, 160),
    alternates: { canonical: `/watch/${id}` },
    openGraph: {
      title: anime.title,
      description: description.slice(0, 160),
      type: 'video.other',
      url: `/watch/${id}`,
      images: anime.cover ? [{ url: anime.cover, alt: anime.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: anime.title,
      description: description.slice(0, 160),
    },
  };
}

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const anime = await getAnimeById(id);
  if (!anime) notFound();

  const user = await getIdentityService().getCurrentUser();
  const [similar, favorited, progress, playerConfig] = await Promise.all([
    getSimilarAnimes(id),
    getFavoritesService().isFavorite(id),
    user ? getWatchProgressService().getMine(id) : Promise.resolve(null),
    getSystemSettingsService().getPublicPlayerConfig(),
  ]);
  const fanartList = anime.fanart
    ? anime.fanart.split(',').map((u) => u.trim()).filter(Boolean)
    : [];
  const watchUrl = `${resolveSiteUrl(process.env.SITE_URL)}/watch/${id}`;

  return (
    <div className="pb-20 sm:pb-24">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'VideoObject',
          name: anime.title,
          description: anime.description?.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim() || `在线观看 ${anime.title}`,
          thumbnailUrl: anime.cover ? [anime.cover] : undefined,
          embedUrl: watchUrl,
          uploadDate: anime.createdAt || undefined,
          url: watchUrl,
        }}
      />
      <div className="page-shell py-5 sm:py-8">
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 font-ui text-sm text-soft hover:bg-card hover:text-ink mb-5 transition"
        >
          <IconArrowLeft size={16} />
          返回里番馆
        </Link>

        <div className="overflow-hidden rounded-2xl border border-border bg-ink shadow-ink">
          <AspectRatio ratio={16 / 9}>
            <WatchPlayer
              animeId={id}
              videoUrl={anime.videoUrl}
              poster={anime.cover}
              title={anime.title}
              cover={anime.cover}
              initialPositionSeconds={progress?.positionSeconds ?? 0}
              initialDurationSeconds={progress?.durationSeconds ?? 0}
              loggedIn={!!user}
              playerConfig={playerConfig}
            />
          </AspectRatio>
        </div>

        {progress && progress.positionSeconds > 5 && !progress.completed && (
          <p className="mt-3 font-meta text-[11px] normal-case tracking-normal text-muted-foreground">
            云端进度约 {Math.floor(progress.positionSeconds / 60)}:
            {String(Math.floor(progress.positionSeconds % 60)).padStart(2, '0')}
            {progress.durationSeconds > 0
              ? ` / ${Math.floor(progress.durationSeconds / 60)}:${String(Math.floor(progress.durationSeconds % 60)).padStart(2, '0')}`
              : ''}
            · 打开后将自动续播
          </p>
        )}

        <div className="mt-6 sm:mt-8 grid lg:grid-cols-3 gap-8 lg:gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="space-y-3">
              <p className="font-meta">Now playing</p>
              <h1 className="section-title text-2xl sm:text-3xl text-ink">{anime.title}</h1>
              <div className="flex flex-wrap gap-x-3 font-ui text-sm text-soft">
                {anime.titleJapanese && <span>{anime.titleJapanese}</span>}
                {anime.titleEnglish && <span>{anime.titleEnglish}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <FavoriteButton
                  animeId={id}
                  favorited={favorited}
                  returnTo={`/watch/${id}`}
                />
                {anime.viewCount != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--success-soft))] px-2.5 py-1 font-ui text-[11px] font-medium text-[hsl(var(--success))] tabular">
                    <IconEye size={12} />
                    {anime.viewCount.toLocaleString()} 次播放
                  </span>
                )}
                {anime.createdAt && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-ui text-[11px] font-medium text-accent">
                    <IconCalendar size={12} />
                    {anime.createdAt}
                  </span>
                )}
              </div>
            </div>

            <section className="border-t border-border pt-6">
              <h2 className="font-meta mb-3">简介</h2>
              <p className="font-ui text-[14px] leading-[1.7] text-foreground/90 whitespace-pre-line max-w-prose">
                {anime.description
                  ? anime.description.replace(/\\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
                  : '暂无简介'}
              </p>
            </section>

            {fanartList.length > 0 && (
              <section className="border-t border-border pt-6 space-y-4">
                <h2 className="section-title text-lg text-ink">剧照</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {fanartList.map((url, index) => (
                    <div key={index} className="aspect-video overflow-hidden rounded-xl border border-border">
                      <MediaImage
                        src={url}
                        alt={`${anime.title} 剧照 ${index + 1}`}
                        className="h-full w-full object-cover"
                        variant="wide"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {similar.length > 0 && (
              <section className="border-t border-border pt-6 space-y-4">
                <h2 className="section-title text-lg text-ink">相关推荐</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                  {similar.map((s) => (
                    <AnimeCard key={s.id} anime={s} />
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside>
            {anime.tags && anime.tags.length > 0 && (
              <div className="surface-panel p-5 lg:sticky lg:top-20">
                <h2 className="font-meta mb-3">里番标签</h2>
                <div className="flex flex-wrap gap-1.5">
                  {anime.tags.map((tag, i) => {
                    const pastels = [
                      'bg-secondary text-secondary-foreground',
                      'bg-[hsl(var(--success-soft))] text-[hsl(var(--success))]',
                      'bg-accent-soft text-accent',
                      'bg-[hsl(var(--danger-soft))] text-danger',
                    ];
                    return (
                      <Link
                        key={tag.id}
                        href={`/browse?tag=${tag.id}&tagName=${encodeURIComponent(tag.name)}`}
                        className={`inline-flex rounded-full px-2.5 py-1 font-ui text-[11px] font-medium ${pastels[i % pastels.length]}`}
                      >
                        {tag.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
