import { AnimeCard } from '@/components/AnimeCard';
import { HeroCarousel } from '@/components/hero-carousel';
import { HorizontalCarousel } from '@/components/horizontal-carousel';
import { getAnimeById, listAnimes } from '@/lib/anime-service';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let popular: Awaited<ReturnType<typeof listAnimes>>['data'] = [];
  let latest: Awaited<ReturnType<typeof listAnimes>>['data'] = [];
  let hero: Awaited<ReturnType<typeof getAnimeById>>[] = [];
  let error: string | null = null;

  try {
    const [pop, lat] = await Promise.all([
      listAnimes({ page: 1, limit: 12, sort: 'popular' }),
      listAnimes({ page: 1, limit: 18, sort: 'latest' }),
    ]);
    popular = pop.data;
    latest = lat.data;
    const heroIds = lat.data.slice(0, 5).map((a) => a.id);
    hero = (await Promise.all(heroIds.map((id) => getAnimeById(id)))).filter(Boolean);
  } catch (e) {
    console.error(e);
    error = e instanceof Error ? e.message : '加载失败';
  }

  const cardWidth = 'w-[140px] sm:w-[156px] md:w-[168px]';

  return (
    <div className="pb-20 sm:pb-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-8 sm:pt-12 space-y-14 sm:space-y-16">
        <header className="max-w-2xl animate-fade-in">
          <p className="font-meta mb-3">Video Catalog</p>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-[2.75rem] text-[#111]">
            观看你想看的
          </h1>
          <p className="mt-3 font-ui text-[15px] text-[#787774] leading-relaxed max-w-prose">
            精选动画与最新上架，海报直达播放页。搜索片名或标签即可开始。
          </p>
        </header>

        {error && (
          <div className="surface-card px-4 py-3 font-ui text-sm text-[#787774]">
            无法加载内容：{error}
          </div>
        )}

        {hero.length > 0 && (
          <HeroCarousel
            items={hero.map((a) => ({
              id: a!.id,
              title: a!.title,
              titleJapanese: a!.titleJapanese,
              description: a!.description,
              cover: a!.cover,
              fanart: a!.fanart,
            }))}
          />
        )}

        {popular.length > 0 && (
          <HorizontalCarousel title="热门" meta="By views" viewAllHref="/browse?sort=popular">
            {popular.map((a) => (
              <div key={a.id} className={`shrink-0 snap-start ${cardWidth}`}>
                <AnimeCard anime={a} showStats />
              </div>
            ))}
          </HorizontalCarousel>
        )}

        {latest.length > 0 && (
          <HorizontalCarousel title="最新" meta="Recently added" viewAllHref="/browse">
            {latest.map((a) => (
              <div key={a.id} className={`shrink-0 snap-start ${cardWidth}`}>
                <AnimeCard anime={a} />
              </div>
            ))}
          </HorizontalCarousel>
        )}
      </div>
    </div>
  );
}
