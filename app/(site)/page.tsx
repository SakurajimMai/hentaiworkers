import Link from 'next/link';
import { AnimeCard } from '@/components/AnimeCard';
import { GuestContinueWatching } from '@/components/continue-watching-client';
import { HeroCarousel, type HeroItem } from '@/components/hero-carousel';
import { HorizontalCarousel } from '@/components/horizontal-carousel';
import { HtmlAd } from '@/components/html-ad';
import { MangaCard } from '@/components/MangaCard';
import { MediaImage } from '@/components/media-image';
import { getAnimeById, listAnimes, recommendFromSeeds } from '@/lib/anime-service';
import { isMangaEnabled, listMangas } from '@/lib/manga-client';
import {
  getFavoritesService,
  getIdentityService,
  getWatchProgressService,
} from '@/lib/server/identity';
import { getSystemSettingsService } from '@/lib/server/system';
import { effectiveHeroSlides } from '@/lib/server/system/domain/settings';
import { StructuredData } from '@/components/structured-data';
import { resolveSiteUrl } from '@/lib/site-url';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  let popular: Awaited<ReturnType<typeof listAnimes>>['data'] = [];
  let latest: Awaited<ReturnType<typeof listAnimes>>['data'] = [];
  let hero: HeroItem[] = [];
  let heroIntervalSeconds = 7;
  let continueWatching: Array<{
    animeId: number;
    title: string;
    cover: string | null;
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
  }> = [];
  let forYou: Awaited<ReturnType<typeof recommendFromSeeds>> = [];
  let mangas: Awaited<ReturnType<typeof listMangas>>['data'] = [];
  let loggedIn = false;
  let error: string | null = null;
  let homeAdHtml = '';

  try {
    const user = await getIdentityService().getCurrentUser();
    loggedIn = !!user;
    const mangaPromise = isMangaEnabled()
      .then((enabled) => (enabled ? listMangas({ page: 1, limit: 8 }) : null))
      .then((result) => result?.data ?? [])
      .catch(() => [] as Awaited<ReturnType<typeof listMangas>>['data']);
    const [pop, lat, progress, favorites, mangaData, system] = await Promise.all([
      listAnimes({ page: 1, limit: 12, sort: 'popular' }),
      listAnimes({ page: 1, limit: 18, sort: 'latest' }),
      user ? getWatchProgressService().listMine(24) : Promise.resolve([]),
      user ? getFavoritesService().listMine() : Promise.resolve([]),
      mangaPromise,
      getSystemSettingsService().getSettings(),
    ]);
    popular = pop.data;
    latest = lat.data;
    mangas = mangaData;
    heroIntervalSeconds = system.hero.intervalSeconds;
    homeAdHtml =
      system.ads.feedSlots.find((slot) => slot.enabled && slot.html.trim())?.html.trim() || '';
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
    const slides = effectiveHeroSlides(system.hero);
    if (slides.length) {
      hero = (
        await Promise.all(
          slides.map(async (slide, index): Promise<HeroItem | null> => {
            if (slide.kind === 'custom') {
              return {
                id: `custom-${index}`,
                title: slide.title || '精选推荐',
                description: slide.description || null,
                imageUrl: slide.imageUrl || null,
                href: slide.linkUrl || '/browse',
                ctaLabel: '查看',
              };
            }
            if (!slide.animeId) return null;
            const anime = await getAnimeById(slide.animeId);
            if (!anime) return null;
            return {
              id: anime.id,
              title: slide.title || anime.title,
              titleJapanese: anime.titleJapanese,
              description: slide.description || anime.description,
              cover: anime.cover,
              fanart: anime.fanart,
              imageUrl: slide.imageUrl || null,
              href: slide.linkUrl || undefined,
            };
          }),
        )
      ).filter((item): item is HeroItem => item !== null);
    } else {
      const fallback = await Promise.all(
        lat.data.slice(0, 6).map((a) => getAnimeById(a.id)),
      );
      hero = fallback
        .filter((anime): anime is NonNullable<typeof anime> => Boolean(anime))
        .map((anime) => ({
          id: anime.id,
          title: anime.title,
          titleJapanese: anime.titleJapanese,
          description: anime.description,
          cover: anime.cover,
          fanart: anime.fanart,
        }));
    }
  } catch (e) {
    console.error(e);
    error = e instanceof Error ? e.message : '加载失败';
  }

  const cardWidth = 'w-[140px] sm:w-[156px] md:w-[168px]';
  const siteUrl = resolveSiteUrl(process.env.SITE_URL);

  return (
    <div className="pb-20 sm:pb-24">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'AnimeStream',
          url: siteUrl,
          inLanguage: 'zh-CN',
          potentialAction: {
            '@type': 'SearchAction',
            target: `${siteUrl}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }}
      />
      <div className="page-shell pt-3 sm:pt-4">
        <h1 className="sr-only">AnimeStream 里番与漫画</h1>
        <div className="space-y-14 sm:space-y-16">
        {error && (
          <div className="notice-error !text-sm">
            无法加载内容：{error}
          </div>
        )}

        {!error && popular.length === 0 && latest.length === 0 && (
          <div className="empty-state">
            <p className="font-meta mb-2">Catalog</p>
            <p className="section-title text-2xl text-ink">片库还是空的</p>
            <p className="mt-2 font-ui text-sm text-soft max-w-md mx-auto leading-relaxed">
              管理员可在后台新建或上架作品。
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/browse" className="btn-ink">
                打开浏览
              </Link>
            </div>
          </div>
        )}

        {hero.length > 0 && (
          <HeroCarousel intervalSeconds={heroIntervalSeconds} items={hero} />
        )}

        {homeAdHtml ? (
          <aside className="reader-ad reader-ad-banner overflow-hidden rounded-2xl border border-border bg-card" aria-label="首页广告">
            <HtmlAd html={homeAdHtml} />
          </aside>
        ) : null}

        {loggedIn && continueWatching.length > 0 && (
          <HorizontalCarousel title="继续观看" viewAllHref="/history">
            {continueWatching.map((p) => {
              const pct =
                p.durationSeconds > 0
                  ? Math.min(100, Math.round((p.positionSeconds / p.durationSeconds) * 100))
                  : 0;
              return (
                <div key={p.animeId} className={`shrink-0 snap-start ${cardWidth}`}>
                  <Link href={`/watch/${p.animeId}`} className="group block space-y-2">
                    <div className="poster-frame aspect-[2/3]">
                      <MediaImage
                        src={p.cover}
                        alt={p.title}
                        width={400}
                        height={600}
                        sizes="(max-width: 640px) 42vw, 168px"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        variant="poster"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-ink/25">
                        <div className="h-full bg-card" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div>
                      <p className="font-ui text-[13px] font-medium text-ink line-clamp-2 leading-snug">
                        {p.title}
                      </p>
                      <p className="font-meta text-[11px] normal-case tracking-normal text-muted-foreground mt-1 tabular">
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
          <HorizontalCarousel title="根据收藏推荐" viewAllHref="/browse?sort=popular">
            {forYou.map((a) => (
              <div key={a.id} className={`shrink-0 snap-start ${cardWidth}`}>
                <AnimeCard anime={a} />
              </div>
            ))}
          </HorizontalCarousel>
        )}

        {popular.length > 0 && (
          <HorizontalCarousel title="热门" viewAllHref="/browse?sort=popular">
            {popular.map((a) => (
              <div key={a.id} className={`shrink-0 snap-start ${cardWidth}`}>
                <AnimeCard anime={a} />
              </div>
            ))}
          </HorizontalCarousel>
        )}

        {latest.length > 0 && (
          <HorizontalCarousel title="最近更新" viewAllHref="/browse">
            {latest.map((a) => (
              <div key={a.id} className={`shrink-0 snap-start ${cardWidth}`}>
                <AnimeCard anime={a} />
              </div>
            ))}
          </HorizontalCarousel>
        )}

        {mangas.length > 0 && (
          <HorizontalCarousel title="漫画更新" viewAllHref="/manga">
            {mangas.map((manga) => (
              <div key={manga.id} className={`shrink-0 snap-start ${cardWidth}`}>
                <MangaCard
                  manga={{
                    id: manga.id,
                    title: manga.title,
                    coverUrl: manga.coverUrl,
                    pageCount: manga.pageCount,
                  }}
                />
              </div>
            ))}
          </HorizontalCarousel>
        )}
        </div>
      </div>
    </div>
  );
}
