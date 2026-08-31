import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AnimeStream',
    short_name: 'AnimeStream',
    description: '里番视频与漫画内容在线浏览',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F6F4EF',
    theme_color: '#121318',
    icons: [
      {
        src: '/brand/animestream-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/animestream-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/animestream-icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
