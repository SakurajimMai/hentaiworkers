import type { Metadata } from 'next';

/** Utility / account surfaces that must not enter the index. */
export const noIndexRobots = { index: false, follow: false } as const;

export const noIndexMetadata = {
  robots: noIndexRobots,
} satisfies Metadata;

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
    locale: 'zh_CN',
    siteName: 'AnimeStream',
    url: input.url,
    images: input.images,
  };
}
