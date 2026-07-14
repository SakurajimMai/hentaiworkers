import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AnimeCard } from '@/components/AnimeCard';
import { IconArrowLeft, IconCalendar, IconEye } from '@/components/icons';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { getAnimeById, getSimilarAnimes } from '@/lib/anime-service';

export const dynamic = 'force-dynamic';

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) notFound();

  const anime = await getAnimeById(id);
  if (!anime) notFound();

  const similar = await getSimilarAnimes(id);
  const fanartList = anime.fanart
    ? anime.fanart.split(',').map((u) => u.trim()).filter(Boolean)
    : [];

  return (
    <div className="pb-20 sm:pb-24">
      <div className="mx-auto max-w-5xl py-5 sm:py-8 px-4 sm:px-6">
        <Link
          href="/browse"
          className="inline-flex items-center gap-2 font-ui text-sm text-[#787774] hover:text-[#111] mb-5"
        >
          <IconArrowLeft size={16} />
          返回
        </Link>

        <div className="overflow-hidden rounded-lg border border-[#EAEAEA] bg-[#111]">
          <AspectRatio ratio={16 / 9}>
            <video
              src={anime.videoUrl}
              className="w-full h-full object-contain bg-black"
              controls
              autoPlay
              poster={anime.cover || undefined}
            />
          </AspectRatio>
        </div>

        <div className="mt-6 sm:mt-8 grid lg:grid-cols-3 gap-8 lg:gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="space-y-3">
              <p className="font-meta">Now playing</p>
              <h1 className="font-serif text-2xl sm:text-3xl text-[#111]">{anime.title}</h1>
              <div className="flex flex-wrap gap-x-3 font-ui text-sm text-[#787774]">
                {anime.titleJapanese && <span>{anime.titleJapanese}</span>}
                {anime.titleEnglish && <span>{anime.titleEnglish}</span>}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {anime.viewCount != null && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDF3EC] px-2.5 py-1 font-ui text-[11px] font-medium text-[#346538] tabular">
                    <IconEye size={12} />
                    {anime.viewCount.toLocaleString()} 次播放
                  </span>
                )}
                {anime.createdAt && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBF3DB] px-2.5 py-1 font-ui text-[11px] font-medium text-[#956400]">
                    <IconCalendar size={12} />
                    {anime.createdAt}
                  </span>
                )}
              </div>
            </div>

            <section className="border-t border-[#EAEAEA] pt-6">
              <h2 className="font-meta mb-3">Synopsis</h2>
              <p className="font-ui text-[14px] leading-[1.7] text-[#2F3437] whitespace-pre-line max-w-prose">
                {anime.description
                  ? anime.description.replace(/\\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
                  : '暂无简介'}
              </p>
            </section>

            {fanartList.length > 0 && (
              <section className="border-t border-[#EAEAEA] pt-6 space-y-4">
                <h2 className="font-serif text-lg">剧照</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {fanartList.map((url, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={index}
                      src={url}
                      alt={`${anime.title} 剧照 ${index + 1}`}
                      className="aspect-video w-full object-cover rounded-md border border-[#EAEAEA]"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ))}
                </div>
              </section>
            )}

            {similar.length > 0 && (
              <section className="border-t border-[#EAEAEA] pt-6 space-y-4">
                <h2 className="font-serif text-lg">相关推荐</h2>
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
              <div className="surface-card p-5 lg:sticky lg:top-20">
                <h2 className="font-meta mb-3">Tags</h2>
                <div className="flex flex-wrap gap-1.5">
                  {anime.tags.map((tag, i) => {
                    const pastels = [
                      'bg-[#E1F3FE] text-[#1F6C9F]',
                      'bg-[#EDF3EC] text-[#346538]',
                      'bg-[#FBF3DB] text-[#956400]',
                      'bg-[#FDEBEC] text-[#9F2F2D]',
                    ];
                    return (
                      <Link
                        key={tag.id}
                        href={`/browse?tag=${tag.id}&tagName=${encodeURIComponent(tag.name)}`}
                        className={`inline-flex rounded-full px-2.5 py-1 font-ui text-[11px] font-medium uppercase tracking-wider ${pastels[i % pastels.length]}`}
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
