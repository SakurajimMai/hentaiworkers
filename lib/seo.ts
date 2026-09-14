import type { Metadata } from 'next';
import { resolveSiteUrl } from '@/lib/site-url';

export const SITE_NAME = 'AnimeStream';
export const SITE_LOCALE = 'zh_CN';
export const SITE_LANGUAGE = 'zh-CN';

/** Utility / account surfaces that must not enter the index. */
export const noIndexRobots = { index: false, follow: false } as const;

export const noIndexMetadata = {
  robots: noIndexRobots,
} satisfies Metadata;

/**
 * Google asks explicit sites to label themselves so SafeSearch can classify pages instead of
 * guessing; it does not remove pages from the index. Bing honours the same tag.
 */
export const ADULT_RATING_META = { rating: 'adult' } as const;

export function siteOrigin(): string {
  return resolveSiteUrl(process.env.SITE_URL);
}

export function absoluteUrl(path: string): string {
  return new URL(path, `${siteOrigin()}/`).toString();
}

/** ISO 8601 string for schema.org date fields, or undefined when the source value is unusable. */
export function isoDate(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function pageOpenGraph(input: {
  title: string;
  description: string;
  url?: string;
  images?: Array<{ url: string; alt?: string }>;
  type?: 'website' | 'article' | 'video.other';
}): NonNullable<Metadata['openGraph']> {
  return {
    title: input.title,
    description: input.description,
    type: input.type ?? 'website',
    locale: SITE_LOCALE,
    siteName: SITE_NAME,
    url: input.url,
    images: input.images,
  };
}

export type BreadcrumbItem = { name: string; path: string };

/** schema.org BreadcrumbList so result snippets show the section a page belongs to. */
export function breadcrumbJsonLd(items: readonly BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
