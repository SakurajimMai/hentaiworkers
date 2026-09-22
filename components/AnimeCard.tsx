import Link from 'next/link';
import { IconPlay, IconEye } from '@/components/icons';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { MediaImage } from '@/components/media-image';
import { formatCompactCount } from '@/lib/format-count';

export type AnimeCardData = {
  id: number;
  title: string;
  cover?: string | null;
  titleJapanese?: string | null;
  viewCount?: number | null;
};

export function AnimeCard({
  anime,
  className = '',
  showStats = false,
  priority = false,
}: {
  anime: AnimeCardData;
  className?: string;
  showStats?: boolean;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/watch/${anime.id}`}
      className={`group block rounded-[1rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-4 focus-visible:ring-offset-background ${className}`}
      aria-label={`观看 ${anime.title}`}
    >
      <div className="poster-frame">
        <AspectRatio ratio={2 / 3}>
          <MediaImage
            src={anime.cover}
            alt={anime.title}
            width={400}
            height={600}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 20vw, 180px"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            variant="poster"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
          />
        </AspectRatio>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-90" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 ease-out group-hover:opacity-100">
          <span className="flex h-11 w-11 scale-90 items-center justify-center rounded-full bg-background/95 text-ink shadow-ink backdrop-blur-md transition-transform duration-300 ease-out group-hover:scale-100 group-hover:bg-accent group-hover:text-white">
            <IconPlay size={15} className="ml-0.5" />
          </span>
        </div>
        {showStats && anime.viewCount != null && (
          <span className="absolute left-2.5 bottom-2.5 inline-flex items-center gap-1 rounded-full bg-ink/75 px-2 py-0.5 font-meta text-[10px] normal-case tracking-normal text-white shadow-sm backdrop-blur-md">
            <IconEye size={11} className="text-white/80" />
            <span className="tabular font-medium">{formatCompactCount(anime.viewCount)}</span>
          </span>
        )}
      </div>
      <div className="pt-2.5 px-0.5">
        <h3
          className="manga-card-title font-ui text-[13px] font-medium tracking-tight text-ink transition-colors duration-200 group-hover:text-accent"
          title={anime.title}
        >
          {anime.title}
        </h3>
        {anime.titleJapanese && (
          <p className="mt-0.5 line-clamp-1 font-ui text-[11px] text-soft">
            {anime.titleJapanese}
          </p>
        )}
      </div>
    </Link>
  );
}
