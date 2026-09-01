import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HorizontalCarousel } from '../components/horizontal-carousel';
import {
  getCarouselPageTarget,
  horizontalCarouselItemClass,
} from '../components/horizontal-carousel-model';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const homePage = readFileSync(new URL('../app/(site)/page.tsx', import.meta.url), 'utf8');
const guestHistory = readFileSync(
  new URL('../components/continue-watching-client.tsx', import.meta.url),
  'utf8',
);
const carouselSource = readFileSync(
  new URL('../components/horizontal-carousel.tsx', import.meta.url),
  'utf8',
);

test('homepage carousel uses exact complete-card columns at responsive breakpoints', () => {
  assert.equal(
    horizontalCarouselItemClass,
    'min-w-0 shrink-0 snap-start basis-[calc(50%_-_0.375rem)] sm:basis-[calc(33.333333%_-_0.666667rem)] md:basis-[calc(25%_-_0.75rem)] lg:basis-[calc(20%_-_0.8rem)]',
  );

  const layouts = [
    { token: 'basis-[calc(50%_-_0.375rem)]', trackWidth: 288, gap: 12, columns: 2 },
    {
      token: 'sm:basis-[calc(33.333333%_-_0.666667rem)]',
      trackWidth: 592,
      gap: 16,
      columns: 3,
    },
    { token: 'md:basis-[calc(25%_-_0.75rem)]', trackWidth: 720, gap: 16, columns: 4 },
    { token: 'lg:basis-[calc(20%_-_0.8rem)]', trackWidth: 976, gap: 16, columns: 5 },
  ];

  for (const { token, trackWidth, gap, columns } of layouts) {
    const match = token.match(/basis-\[calc\(([\d.]+)%_-_([\d.]+)rem\)\]/);
    assert.ok(match, `invalid carousel basis token: ${token}`);
    const cardWidth = trackWidth * (Number(match[1]) / 100) - Number(match[2]) * 16;
    const occupiedWidth = cardWidth * columns + gap * (columns - 1);
    assert.ok(
      Math.abs(occupiedWidth - trackWidth) < 0.001,
      `${columns} cards must exactly fill a ${trackWidth}px track`,
    );
  }
});

test('all homepage carousel sections share the track-owned item sizing', () => {
  assert.doesNotMatch(homePage, /cardWidth|w-\[140px\]|snap-start|shrink-0/);
  assert.doesNotMatch(guestHistory, /cardWidth|w-\[140px\]|snap-start/);
  assert.match(homePage, /<GuestContinueWatching \/>/);
  assert.match(guestHistory, /export function GuestContinueWatching\(\)/);
  assert.equal(homePage.match(/className=\{horizontalCarouselItemClass\}/g)?.length, 5);
  assert.equal(guestHistory.match(/className=\{horizontalCarouselItemClass\}/g)?.length, 1);
});

test('carousel page buttons move a complete viewport plus the inter-page gap', () => {
  const dimensions = {
    scrollLeft: 0,
    clientWidth: 976,
    scrollWidth: 2960,
    gap: 16,
  };

  assert.equal(getCarouselPageTarget(dimensions, 'right'), 992);
  assert.equal(
    getCarouselPageTarget({ ...dimensions, scrollLeft: 992 }, 'left'),
    0,
  );
  assert.equal(
    getCarouselPageTarget({ ...dimensions, scrollLeft: 1500 }, 'right'),
    1984,
  );
  assert.equal(
    getCarouselPageTarget({ ...dimensions, scrollLeft: 100 }, 'left'),
    0,
  );

  const partialLastPage = {
    scrollLeft: 0,
    clientWidth: 90,
    scrollWidth: 230,
    gap: 10,
  };
  const lastPage = getCarouselPageTarget(
    { ...partialLastPage, scrollLeft: 100 },
    'right',
  );
  assert.equal(lastPage, 140);
  assert.equal(
    getCarouselPageTarget({ ...partialLastPage, scrollLeft: lastPage }, 'left'),
    100,
  );
  assert.equal(
    getCarouselPageTarget({ ...partialLastPage, scrollLeft: 100 }, 'left'),
    0,
  );
});

test('carousel exposes labelled keyboard controls and touch-scroll semantics', () => {
  const markup = renderToStaticMarkup(
    React.createElement(HorizontalCarousel, {
      title: '热门',
      children: Array.from({ length: 6 }, (_, index) =>
        React.createElement('article', { key: index }, `Card ${index + 1}`),
      ),
    }),
  );

  assert.match(markup, /aria-labelledby="[^"]+"/);
  assert.match(markup, /aria-roledescription="carousel"/);
  assert.match(markup, /aria-label="热门横向列表"/);
  assert.match(markup, /aria-label="向右滚动"[^>]*aria-controls="[^"]+"/);
  assert.match(markup, /overflow-x-auto/);
  assert.match(markup, /snap-mandatory/);
  assert.match(markup, /motion-reduce:scroll-auto/);
  assert.match(markup, /h-11 w-11/);
  assert.match(markup, /aria-label="向左滚动"[^>]*disabled/);
  assert.match(markup, /aria-label="向右滚动"[^>]*disabled/);
  assert.match(carouselSource, /typeof ResizeObserver === 'undefined'/);
});
