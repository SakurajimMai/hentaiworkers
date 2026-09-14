/**
 * Sitemap index + section builders. Google and Bing accept at most 50,000 URLs / 50 MB per
 * file, so every section is chunked well below that and listed from `/sitemap.xml`. Detail
 * entries carry the cover as an image so Google Images can index posters.
 */

export const MAX_SITEMAP_URLS = 50_000;
export const SITEMAP_CHUNK_SIZE = 10_000;
export const SITEMAP_SECTION_BASE = '/sitemaps';
export const SITEMAP_CACHE_CONTROL = 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400';

export type SitemapAnime = {
  id: number;
  createdAt: string | null;
  updatedAt: string | null;
  cover?: string | null;
};

export type SitemapTag = {
  id: number;
  name: string;
};

export type SitemapManga = {
  id: number;
  slug: string;
  updatedAt: string | Date | null;
  coverUrl?: string | null;
};

export type SitemapChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

export type SitemapUrl = {
  url: string;
  lastModified?: Date;
  changeFrequency?: SitemapChangeFrequency;
  priority?: number;
  images?: readonly string[];
};

export type SitemapIndexEntry = {
  url: string;
  lastModified?: Date;
};

export type SitemapSection = 'pages' | 'animes' | 'mangas' | 'tags' | 'manga-tags';

export type SitemapSectionRef = { section: SitemapSection; index: number };

export type SitemapSource = {
  animes: readonly SitemapAnime[];
  mangas: readonly SitemapManga[];
  tags: readonly SitemapTag[];
  /** Admin-curated manga tags; only these tag listings are indexable. */
  mangaTags: readonly string[];
};

const SECTIONS: readonly SitemapSection[] = ['pages', 'animes', 'mangas', 'tags', 'manga-tags'];

export function normalizeSitemapBaseUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('SITE_URL 不能为空');
  }
  return normalized;
}

function validDate(value: string | Date | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function httpImage(value: string | null | undefined): string[] {
  const url = (value ?? '').trim();
  return /^https?:\/\//i.test(url) ? [url] : [];
}

function latest(dates: readonly (Date | undefined)[]): Date | undefined {
  let result: Date | undefined;
  for (const date of dates) {
    if (date && (!result || date > result)) result = date;
  }
  return result;
}

export function chunkSitemapEntries<T>(items: readonly T[], size = SITEMAP_CHUNK_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1 || size > MAX_SITEMAP_URLS) {
    throw new RangeError('sitemap chunk size must be between 1 and 50,000');
  }
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/** Public indexable hubs that always appear in the sitemap. */
export const SITEMAP_STATIC_PATHS = ['/', '/browse', '/manga', '/privacy', '/terms'] as const;

export function buildStaticSitemap(baseUrl: string): SitemapUrl[] {
  const base = normalizeSitemapBaseUrl(baseUrl);
  return SITEMAP_STATIC_PATHS.map((path) => ({
    url: path === '/' ? `${base}/` : `${base}${path}`,
    changeFrequency: path === '/privacy' || path === '/terms' ? 'yearly' : 'daily',
    priority: path === '/' ? 1 : path === '/browse' || path === '/manga' ? 0.9 : 0.3,
  }));
}

export function buildAnimeSitemap(baseUrl: string, animes: readonly SitemapAnime[]): SitemapUrl[] {
  const base = normalizeSitemapBaseUrl(baseUrl);
  return animes.map((anime) => ({
    url: `${base}/watch/${anime.id}`,
    lastModified: validDate(anime.updatedAt ?? anime.createdAt),
    changeFrequency: 'weekly',
    priority: 0.8,
    images: httpImage(anime.cover),
  }));
}

export function buildMangaSitemap(baseUrl: string, mangas: readonly SitemapManga[]): SitemapUrl[] {
  const base = normalizeSitemapBaseUrl(baseUrl);
  return mangas.map((manga) => ({
    url: `${base}/manga/${manga.id}`,
    lastModified: validDate(manga.updatedAt),
    changeFrequency: 'weekly',
    priority: 0.8,
    images: httpImage(manga.coverUrl),
  }));
}

export function buildTagSitemap(baseUrl: string, tags: readonly SitemapTag[]): SitemapUrl[] {
  const base = normalizeSitemapBaseUrl(baseUrl);
  return tags.map((tag) => ({
    // Single query param keeps the XML loc free of raw `&`.
    url: `${base}/browse?tag=${tag.id}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));
}

export function buildMangaTagSitemap(baseUrl: string, tags: readonly string[]): SitemapUrl[] {
  const base = normalizeSitemapBaseUrl(baseUrl);
  const seen = new Set<string>();
  const entries: SitemapUrl[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    entries.push({
      url: `${base}/manga?tag=${encodeURIComponent(tag)}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }
  return entries;
}

function sectionEntries(section: SitemapSection, baseUrl: string, source: SitemapSource): SitemapUrl[] {
  switch (section) {
    case 'pages':
      return buildStaticSitemap(baseUrl);
    case 'animes':
      return buildAnimeSitemap(baseUrl, source.animes);
    case 'mangas':
      return buildMangaSitemap(baseUrl, source.mangas);
    case 'tags':
      return buildTagSitemap(baseUrl, source.tags);
    case 'manga-tags':
      return buildMangaTagSitemap(baseUrl, source.mangaTags);
  }
}

/** `animes-2.xml` → section `animes`, chunk 2 (1-based). `pages.xml` is the single static file. */
export function parseSitemapSectionName(name: string): SitemapSectionRef | null {
  // No leading zeros: `animes-01.xml` must not resolve to the same file as `animes-1.xml`.
  const match = /^([a-z-]+?)(?:-([1-9]\d{0,3}))?\.xml$/.exec(name);
  if (!match) return null;
  const section = match[1] as SitemapSection;
  if (!SECTIONS.includes(section)) return null;
  if (section === 'pages') return match[2] === undefined ? { section, index: 1 } : null;
  if (match[2] === undefined) return null;
  const index = Number(match[2]);
  return index >= 1 ? { section, index } : null;
}

export function sitemapSectionName(ref: SitemapSectionRef): string {
  return ref.section === 'pages' ? 'pages.xml' : `${ref.section}-${ref.index}.xml`;
}

export type SitemapSectionFile = {
  name: string;
  entries: SitemapUrl[];
  lastModified?: Date;
};

/** Every child sitemap in index order, chunked per section. Empty sections are omitted. */
export function buildSitemapSections(baseUrl: string, source: SitemapSource): SitemapSectionFile[] {
  const files: SitemapSectionFile[] = [];
  for (const section of SECTIONS) {
    const entries = sectionEntries(section, baseUrl, source);
    if (entries.length === 0) continue;
    chunkSitemapEntries(entries).forEach((chunk, position) => {
      files.push({
        name: sitemapSectionName({ section, index: position + 1 }),
        entries: chunk,
        lastModified: latest(chunk.map((entry) => entry.lastModified)),
      });
    });
  }
  return files;
}

export function buildSitemapSection(
  baseUrl: string,
  source: SitemapSource,
  ref: SitemapSectionRef,
): SitemapSectionFile | null {
  const entries = sectionEntries(ref.section, baseUrl, source);
  const chunk = chunkSitemapEntries(entries)[ref.index - 1];
  if (!chunk) return null;
  return {
    name: sitemapSectionName(ref),
    entries: chunk,
    lastModified: latest(chunk.map((entry) => entry.lastModified)),
  };
}

export function buildSitemapIndex(baseUrl: string, source: SitemapSource): SitemapIndexEntry[] {
  const base = normalizeSitemapBaseUrl(baseUrl);
  return buildSitemapSections(base, source).map((file) => ({
    url: `${base}${SITEMAP_SECTION_BASE}/${file.name}`,
    lastModified: file.lastModified,
  }));
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderUrlSet(entries: readonly SitemapUrl[]): string {
  if (entries.length > MAX_SITEMAP_URLS) {
    throw new Error('站点地图超过单文件 50,000 条 URL 上限，需要启用分片');
  }
  const withImages = entries.some((entry) => entry.images && entry.images.length > 0);
  const namespaces = [
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    withImages ? 'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : '',
  ].filter(Boolean).join(' ');
  const body = entries.map((entry) => {
    const parts = [`<loc>${escapeXml(entry.url)}</loc>`];
    if (entry.lastModified) parts.push(`<lastmod>${entry.lastModified.toISOString()}</lastmod>`);
    if (entry.changeFrequency) parts.push(`<changefreq>${entry.changeFrequency}</changefreq>`);
    if (entry.priority !== undefined) parts.push(`<priority>${entry.priority.toFixed(1)}</priority>`);
    for (const image of entry.images ?? []) {
      parts.push(`<image:image><image:loc>${escapeXml(image)}</image:loc></image:image>`);
    }
    return `<url>${parts.join('')}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${namespaces}>\n${body.join('\n')}\n</urlset>\n`;
}

export function renderSitemapIndex(entries: readonly SitemapIndexEntry[]): string {
  const body = entries.map((entry) => {
    const parts = [`<loc>${escapeXml(entry.url)}</loc>`];
    if (entry.lastModified) parts.push(`<lastmod>${entry.lastModified.toISOString()}</lastmod>`);
    return `<sitemap>${parts.join('')}</sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body.join('\n')}\n</sitemapindex>\n`;
}
