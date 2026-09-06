import type { Metadata, Viewport } from 'next';
import { getGlobalMetaTags } from '@/lib/server/site-metadata';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'AnimeStream · 里番与漫画',
    template: '%s · AnimeStream',
  },
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  description: 'AnimeStream 提供里番视频浏览、托管 MP4 播放、漫画在线阅读、观看进度同步与片单收藏。',
  applicationName: 'AnimeStream',
  keywords: ['里番', '在线观影', '漫画阅读', 'AnimeStream'],
  openGraph: {
    title: 'AnimeStream · 里番与漫画',
    description: '浏览里番视频与漫画内容，继续上次进度，管理你的片单。',
    type: 'website',
    locale: 'zh_CN',
    siteName: 'AnimeStream',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AnimeStream · 里番与漫画',
    description: '里番视频与漫画内容在线浏览。',
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
      <body>{children}</body>
    </html>
  );
}
