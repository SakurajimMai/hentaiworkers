import { MAX_HERO_SLIDES, type HeroSlide } from './settings';

function parseLegacyAnimeIds(raw: string): number[] {
  return raw
    .split(/[\s,，;；]+/)
    .map((item) => parseInt(item, 10))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MAX_HERO_SLIDES);
}

function sanitizeSlide(value: unknown): HeroSlide | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind === 'custom' ? 'custom' : 'anime';
  const animeIdRaw = Number(raw.animeId);
  const animeId = Number.isInteger(animeIdRaw) && animeIdRaw > 0 ? animeIdRaw : null;
  const text = (key: string, max: number) =>
    typeof raw[key] === 'string' ? (raw[key] as string).trim().slice(0, max) : '';

  const slide: HeroSlide = {
    kind,
    animeId,
    title: text('title', 200),
    imageUrl: text('imageUrl', 1000),
    linkUrl: text('linkUrl', 1000),
    description: text('description', 500),
  };

  if (slide.kind === 'anime' && !slide.animeId) return null;
  if (slide.kind === 'custom' && !slide.imageUrl) return null;
  return slide;
}

/**
 * Reads the hero slide editor payload (`heroSlidesJson`) plus interval.
 * Falls back to the legacy `heroAnimeIds` textarea when no JSON is posted.
 * Also derives `animeIds` so legacy readers keep working.
 */
export function parseHeroSettingsFromForm(formData: FormData) {
  const intervalSeconds = Math.max(
    2,
    Math.min(60, parseInt(String(formData.get('heroIntervalSeconds') || '7'), 10) || 7),
  );

  let slides: HeroSlide[] = [];
  const slidesJson = String(formData.get('heroSlidesJson') || '').trim();
  if (slidesJson) {
    try {
      const parsed = JSON.parse(slidesJson) as unknown;
      if (Array.isArray(parsed)) {
        slides = parsed
          .map(sanitizeSlide)
          .filter((slide): slide is HeroSlide => slide !== null)
          .slice(0, MAX_HERO_SLIDES);
      }
    } catch {
      // Malformed editor payload degrades to the legacy field below.
    }
  }

  if (!slides.length) {
    const legacyIds = parseLegacyAnimeIds(String(formData.get('heroAnimeIds') || ''));
    slides = legacyIds.map((animeId) => ({
      kind: 'anime' as const,
      animeId,
      title: '',
      imageUrl: '',
      linkUrl: '',
      description: '',
    }));
  }

  const animeIds = slides
    .filter((slide) => slide.kind === 'anime' && slide.animeId)
    .map((slide) => slide.animeId as number);

  return { slides, animeIds, intervalSeconds };
}
