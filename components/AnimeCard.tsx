import Link from 'next/link';
import { IconPlay, IconEye } from '@/components/icons';
import { AspectRatio } from '@/components/ui/aspect-ratio';

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
}: {
  anime: AnimeCardData;
  className?: string;
  showStats?: boolean;
}) {
  return (
    <Link href={`/watch/${anime.id}`} className={`group block ${className}`}>
      <div className="relative overflow-hidden rounded-lg border border-[#EAEAEA] bg-white transition-shadow duration-200 group-hover:shadow-whisper">
        <AspectRatio ratio={2 / 3}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={anime.cover || 'https://placehold.co/400x600/f7f6f3/787774?text=No+Cover'}
            alt={anime.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </AspectRatio>
        <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/25" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-white text-[#111]">
            <IconPlay size={14} className="ml-0.5" />
          </span>
        </div>
        {showStats && anime.viewCount != null && (
          <span className="absolute left-2 bottom-2 flex items-center gap-1 rounded-sm bg-white/90 px-1.5 py-0.5 font-meta text-[10px] normal-case tracking-normal text-[#111]">
            <IconEye size={11} />
            <span className="tabular">{formatCount(anime.viewCount)}</span>
          </span>
        )}
      </div>
      <div className="pt-2.5 px-0.5">
        <h3 className="font-ui line-clamp-1 text-[13px] font-medium tracking-tight text-[#111]" title={anime.title}>
          {anime.title}
        </h3>
        {anime.titleJapanese && (
          <p className="mt-0.5 line-clamp-1 font-ui text-[11px] text-[#787774]">{anime.titleJapanese}</p>
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
