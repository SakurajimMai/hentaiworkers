import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHeroSettingsFromForm } from '../../lib/server/system/domain/hero-settings-form';
import {
  effectiveHeroSlides,
  parseSystemSettings,
} from '../../lib/server/system/domain/settings';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.set(key, value);
  }
  return fd;
}

test('hero settings default to empty ids/slides and 7 seconds', () => {
  const settings = parseSystemSettings({});
  assert.deepEqual(settings.hero.animeIds, []);
  assert.deepEqual(settings.hero.slides, []);
  assert.equal(settings.hero.intervalSeconds, 7);
});

test('parseHeroSettingsFromForm keeps legacy ids field working', () => {
  const parsed = parseHeroSettingsFromForm(
    form({
      heroAnimeIds: '12\n34, 56',
      heroIntervalSeconds: '5',
    }),
  );
  assert.deepEqual(parsed.animeIds, [12, 34, 56]);
  assert.equal(parsed.slides.length, 3);
  assert.deepEqual(parsed.slides[0], {
    kind: 'anime',
    animeId: 12,
    title: '',
    imageUrl: '',
    linkUrl: '',
    description: '',
  });
  assert.equal(parsed.intervalSeconds, 5);

  const high = parseHeroSettingsFromForm(form({ heroIntervalSeconds: '999' }));
  assert.equal(high.intervalSeconds, 60);
  const low = parseHeroSettingsFromForm(form({ heroIntervalSeconds: '1' }));
  assert.equal(low.intervalSeconds, 2);
});

test('parseHeroSettingsFromForm reads mixed slides json', () => {
  const parsed = parseHeroSettingsFromForm(
    form({
      heroSlidesJson: JSON.stringify([
        { kind: 'anime', animeId: 7, imageUrl: 'https://cdn.example/override.jpg' },
        {
          kind: 'custom',
          title: '周年活动',
          imageUrl: 'https://cdn.example/event.jpg',
          linkUrl: '/manga',
          description: '全新漫画上线',
        },
        // Invalid entries are dropped.
        { kind: 'anime' },
        { kind: 'custom', title: '没有封面' },
        'not-an-object',
      ]),
      heroIntervalSeconds: '9',
    }),
  );
  assert.equal(parsed.slides.length, 2);
  assert.equal(parsed.slides[0].kind, 'anime');
  assert.equal(parsed.slides[0].animeId, 7);
  assert.equal(parsed.slides[0].imageUrl, 'https://cdn.example/override.jpg');
  assert.equal(parsed.slides[1].kind, 'custom');
  assert.equal(parsed.slides[1].title, '周年活动');
  assert.deepEqual(parsed.animeIds, [7]);
  assert.equal(parsed.intervalSeconds, 9);
});

test('parseHeroSettingsFromForm caps slides at 20 (not limited to 3)', () => {
  const slides = Array.from({ length: 30 }, (_, index) => ({
    kind: 'anime',
    animeId: index + 1,
  }));
  const parsed = parseHeroSettingsFromForm(
    form({ heroSlidesJson: JSON.stringify(slides) }),
  );
  assert.equal(parsed.slides.length, 20);
  assert.equal(parsed.animeIds.length, 20);
});

test('effectiveHeroSlides falls back to legacy animeIds', () => {
  const settings = parseSystemSettings({
    hero: { animeIds: [3, 4], intervalSeconds: 7 },
  });
  const slides = effectiveHeroSlides(settings.hero);
  assert.equal(slides.length, 2);
  assert.equal(slides[0].kind, 'anime');
  assert.equal(slides[0].animeId, 3);

  const withSlides = parseSystemSettings({
    hero: {
      animeIds: [3],
      slides: [
        {
          kind: 'custom',
          animeId: null,
          title: 'T',
          imageUrl: 'https://cdn.example/a.jpg',
          linkUrl: '',
          description: '',
        },
      ],
      intervalSeconds: 7,
    },
  });
  const effective = effectiveHeroSlides(withSlides.hero);
  assert.equal(effective.length, 1);
  assert.equal(effective[0].kind, 'custom');
});

test('manga settings accept curated tags', () => {
  const settings = parseSystemSettings({
    manga: { enabled: true, publishSecret: null, curatedTags: ['校园', '奇幻'] },
  });
  assert.deepEqual(settings.manga.curatedTags, ['校园', '奇幻']);
  const defaults = parseSystemSettings({});
  assert.deepEqual(defaults.manga.curatedTags, []);
});
