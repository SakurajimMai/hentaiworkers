export type CarouselDirection = 'left' | 'right';

export const horizontalCarouselItemClass =
  'min-w-0 shrink-0 snap-start basis-[calc(50%_-_0.375rem)] sm:basis-[calc(33.333333%_-_0.666667rem)] md:basis-[calc(25%_-_0.75rem)] lg:basis-[calc(20%_-_0.8rem)]';

export function getCarouselPageTarget(
  {
    scrollLeft,
    clientWidth,
    scrollWidth,
    gap,
  }: {
    scrollLeft: number;
    clientWidth: number;
    scrollWidth: number;
    gap: number;
  },
  direction: CarouselDirection,
): number {
  const viewport = Number.isFinite(clientWidth) ? Math.max(0, clientWidth) : 0;
  const content = Number.isFinite(scrollWidth) ? Math.max(viewport, scrollWidth) : viewport;
  const current = Number.isFinite(scrollLeft) ? Math.max(0, scrollLeft) : 0;
  const itemGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  const maxScroll = Math.max(0, content - viewport);
  const clampedCurrent = Math.min(maxScroll, current);
  const pageSpan = viewport + itemGap;

  if (pageSpan <= 0) return 0;

  if (direction === 'left' && maxScroll - clampedCurrent <= 1) {
    const previousPage = Math.floor(maxScroll / pageSpan) * pageSpan;
    if (maxScroll - previousPage > 1) return previousPage;
  }

  const delta = direction === 'left' ? -pageSpan : pageSpan;
  return Math.min(maxScroll, Math.max(0, clampedCurrent + delta));
}
