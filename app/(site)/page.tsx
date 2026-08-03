import Link from 'next/link';
import { AnimeCard } from '@/components/AnimeCard';
import { GuestContinueWatching } from '@/components/continue-watching-client';
import { HeroCarousel } from '@/components/hero-carousel';
import { HorizontalCarousel } from '@/components/horizontal-carousel';
import { getAnimeById, listAnimes, recommendFromSeeds } from '@/lib/anime-service';
import {
  getFavoritesService,
  getIdentityService,
  getWatchProgressService,
} from '@/lib/server/identity';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let popular: Awaited<ReturnType<typeof listAnimes>>['data'] = [];
  let latest: Awaited<ReturnType<typeof listAnimes>>['data'] = [];
  let hero: Awaited<ReturnType<typeof getAnimeById>>[] = [];
  let continueWatching: Array<{
    animeId: number;
    title: string;
    cover: string | null;
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
  }> = [];
  let forYou: Awaited<ReturnType<typeof recommendFromSeeds>> = [];
  let loggedIn = false;
  let error: string | null = null;

  try {
    const user = await getIdentityService().getCurrentUser();
    loggedIn = !!user;
    const [pop, lat, progress, favorites] = await Promise.all([
      listAnimes({ page: 1, limit: 12, sort: 'popular' }),
      listAnimes({ page: 1, limit: 18, sort: 'latest' }),
      user ? getWatchProgressService().listMine(24) : Promise.resolve([]),
      user ? getFavoritesService().listMine() : Promise.resolve([]),
    ]);
    popular = pop.data;
    latest = lat.data;
    continueWatching = progress.filter((p) => !p.completed && p.positionSeconds > 5);
    const completedIds = progress.filter((p) => p.completed).map((p) => p.animeId);
    const seedIds = [
      ...favorites.map((f) => f.id),
      ...progress.map((p) => p.animeId),
    ];
    if (seedIds.length) {
      forYou = await recommendFromSeeds(seedIds, {
        excludeIds: [...completedIds, ...seedIds],
        limit: 12,
      });
    }
    const heroIds = lat.data.slice(0, 5).map((a) => a.id);
    hero = (await Promise.all(heroIds.map((id) => getAnimeById(id)))).filter(Boolean);
  } catch (e) {
    console.error(e);
    error = e instanceof Error ? e.message : '加载失败';
  }

  const cardWidth = 'w-[140px] sm:w-[156px] md:w-[168px]';

  return (
    <div className="pb-20 sm:pb-24">
      <div className="page-shell pt-8 sm:pt-12 space-y-14 sm:space-y-16">
        <header className="max-w-2xl animate-fade-in">
          <p className="font-meta mb-3">里番</p>
          <h1 className="section-title text-3xl sm:text-4xl md:text-[2.85rem] text-ink">
            观看你想看的
          </h1>
          <p className="mt-3.5 font-ui text-[15px] text-soft leading-relaxed max-w-prose">
            继续上次进度，或从热门与最新上架开始；全部内容见{' '}
            <Link
              href="/browse"
              className="text-ink font-medium underline underline-offset-2 decoration-[#d8d4cb] hover:decoration-[#1a1917]"
            >
              浏览
            </Link>
            。
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-[#f3d4d3] bg-[#fdf2f2] px-4 py-3 font-ui text-sm text-[#9F2F2D]">
            无法加载内容：{error}
          </div>
        )}

        {!error && popular.length === 0 && latest.length === 0 && (
          <div className="empty-state">
            <p className="font-meta mb-2">Catalog</p>
            <p className="section-title text-2xl text-ink">片库还是空的</p>
            <p className="mt-2 font-ui text-sm text-soft max-w-md mx-auto leading-relaxed">
              管理员可在后台新建作品或批量导入内容。
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/browse" className="btn-ink">
                打开浏览
              </Link>
            </div>
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

        {loggedIn && continueWatching.length > 0 && (
          <HorizontalCarousel title="继续观看" meta="Synced" viewAllHref="/history">
            {continueWatching.map((p) => {
              const pct =
                p.durationSeconds > 0
                  ? Math.min(100, Math.round((p.positionSeconds / p.durationSeconds) * 100))
                  : 0;
              return (
                <div key={p.animeId} className={`shrink-0 snap-start ${cardWidth}`}>
                  <Link href={`/watch/${p.animeId}`} className="group block space-y-2">
                    <div className="poster-frame aspect-[2/3]">
                      {p.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.cover}
                          alt={p.title}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center font-meta text-[11px] normal-case tracking-normal text-[#8a877f]">
                          无封面
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-[#1a1917]/25">
                        <div className="h-full bg-white" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div>
                      <p className="font-ui text-[13px] font-medium text-ink line-clamp-2 leading-snug">
                        {p.title}
                      </p>
                      <p className="font-meta text-[11px] normal-case tracking-normal text-[#8a877f] mt-1 tabular">
                        继续 · {pct}%
                      </p>
                    </div>
                  </Link>
                </div>
              );
            })}
          </HorizontalCarousel>
        )}

        {!loggedIn && <GuestContinueWatching cardWidth={cardWidth} />}

        {loggedIn && forYou.length > 0 && (
          <HorizontalCarousel title="根据收藏推荐" meta="Shared tags" viewAllHref="/browse?sort=popular">
            {forYou.map((a) => (
              <div key={a.id} className={`shrink-0 snap-start ${cardWidth}`}>
                <AnimeCard anime={a} />
              </div>
            ))}
          </HorizontalCarousel>
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
          <HorizontalCarousel title="最近更新" meta="Recently added" viewAllHref="/browse">
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
