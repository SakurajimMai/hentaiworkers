import Link from 'next/link';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { MediaImage } from '@/components/media-image';

export type MangaCardData = {
  id: number;
  title: string;
  coverUrl?: string | null;
  pageCount?: number | null;
};

export function MangaCard({
  manga,
  className = '',
}: {
  manga: MangaCardData;
  className?: string;
}) {
  return (
    <Link
      href={`/manga/${manga.id}`}
      className={`group block rounded-[1rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-4 focus-visible:ring-offset-background ${className}`}
      aria-label={`查看 ${manga.title}`}
    >
      <div className="poster-frame aspect-[2/3]">
        <AspectRatio ratio={2 / 3}>
          <MediaImage
            src={manga.coverUrl}
            alt={manga.title}
            width={400}
            height={600}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 20vw, 180px"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            variant="poster"
            loading="lazy"
          />
        </AspectRatio>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent opacity-80" />
        <span className="absolute bottom-2.5 right-2.5 rounded-full bg-ink/80 px-2.5 py-1 font-meta text-[10px] normal-case tracking-normal text-background backdrop-blur-sm">
          P{manga.pageCount != null && manga.pageCount > 0 ? manga.pageCount : '—'}
        </span>
      </div>
      <div className="pt-2.5 px-0.5">
        <h3
          className="manga-card-title font-ui text-[13px] font-medium tracking-tight text-ink transition-colors group-hover:text-accent"
          title={manga.title}
        >
          {manga.title}
        </h3>
      </div>
    </Link>
  );
}
