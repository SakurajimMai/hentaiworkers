import { ImageResponse } from 'next/og';
import { BrandMark } from '@/components/brand-mark';

export const alt = 'AnimeStream 里番与漫画';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#121318',
          color: '#F6F4EF',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 88,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 34 }}>
          <BrandMark style={{ width: 128, height: 128 }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 72, fontWeight: 700 }}>AnimeStream</div>
            <div style={{ fontSize: 34, marginTop: 18, opacity: 0.7 }}>里番与漫画</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
