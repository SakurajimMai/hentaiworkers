import type { Metadata } from 'next';
import { resolveSiteUrl } from '@/lib/site-url';

export const SITE_NAME = 'AnimeStream';
export const SITE_LOCALE = 'zh_CN';
export const SITE_LANGUAGE = 'zh-CN';

/** Utility / account surfaces that must not enter the index. */
export const noIndexRobots = { index: false, follow: false } as const;

/**
 * Next resolves `robots` per layer without merging, so a page that sets its own robots object
 * replaces the root layout's wholesale. Listing pages must therefore spread these, or they
 * silently lose the googleBot preview directives the rest of the site advertises.
 */
export const googleBotDirectives = {
  index: true,
  follow: true,
  'max-image-preview': 'large',
  'max-snippet': -1,
  'max-video-preview': -1,
} as const;

export const indexableRobots = {
  index: true,
  follow: true,
  googleBot: googleBotDirectives,
} as const;

/** Not a landing page, but its links are still worth following. */
export const followOnlyRobots = { index: false, follow: true } as const;

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
  // `animes.created_at` is a zone-less `YYYY-MM-DD HH:MM:SS` text column. Left alone, the runtime
  // reads it in the server's local zone and the published date silently shifts.
  const normalized =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value.trim())
      ? `${value.trim().replace(' ', 'T')}Z`
      : value;
  const date = normalized instanceof Date ? normalized : new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Absolute http(s) URL for structured data, or undefined when the value cannot become one.
 * Catalog media fields may hold a site-relative path, and a VideoObject without contentUrl or
 * embedUrl is rejected by Google.
 */
export function absoluteMediaUrl(value: string | null | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw, `${siteOrigin()}/`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function pageOpenGraph(input: {
  title: string;
  siteName?: string;
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
    siteName: input.siteName ?? SITE_NAME,
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
