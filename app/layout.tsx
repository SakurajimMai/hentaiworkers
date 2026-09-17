import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { CatalogScrollRestoration } from '@/components/catalog-scroll-restoration';
import { buildSiteMetadata } from '@/lib/site-seo';
import { getGlobalMetaTags, getSiteSeo } from '@/lib/server/site-metadata';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...buildSiteMetadata(await getSiteSeo()),
    metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f4ef' },
    { media: '(prefers-color-scheme: dark)', color: '#121318' },
  ],
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

const THEME_BOOT_SCRIPT = `(function(){try{var k='animestream.theme.v1';var s=localStorage.getItem(k);var m=(s==='light'||s==='dark')?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var r=document.documentElement;r.setAttribute('data-theme',m);r.style.colorScheme=m;var c=m==='dark'?'#121318':'#f6f4ef';var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',c);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const metaTags = await getGlobalMetaTags();
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {metaTags.map((tag, index) => (
          <meta
            key={`site-meta-${index}`}
            name={tag.attribute === 'name' ? tag.key : undefined}
            property={tag.attribute === 'property' ? tag.key : undefined}
            content={tag.content}
          />
        ))}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Suspense fallback={null}>
          <CatalogScrollRestoration />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
