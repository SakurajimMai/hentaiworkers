import Link from 'next/link';
import { IconPlay, IconEye } from '@/components/icons';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { MediaImage } from '@/components/media-image';

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
    <Link href={`/watch/${anime.id}`} className={`group block ${className}`}>
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
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent opacity-80" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background/95 text-ink shadow-ink backdrop-blur-sm">
            <IconPlay size={14} className="ml-0.5" />
          </span>
        </div>
        {showStats && anime.viewCount != null && (
          <span className="absolute left-2.5 bottom-2.5 flex items-center gap-1 rounded-full bg-ink/55 px-2 py-0.5 font-meta text-[10px] normal-case tracking-normal text-background backdrop-blur-sm">
            <IconEye size={11} />
            <span className="tabular">{formatCount(anime.viewCount)}</span>
          </span>
        )}
      </div>
      <div className="pt-2.5 px-0.5">
        <h3
          className="manga-card-title font-ui text-[13px] font-medium tracking-tight text-ink"
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

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}
