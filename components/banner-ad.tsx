'use client';

import { useEffect, useState } from 'react';
import { HtmlAd } from '@/components/html-ad';
import {
  bannerAdDocumentId,
  htmlAdDocumentPath,
  type BannerAdPlacement,
  type BannerAdVariant,
} from '@/lib/html-ad-document';

export function BannerAd({
  placement,
  desktopHtml,
  mobileHtml,
  className = '',
}: {
  placement: BannerAdPlacement;
  desktopHtml: string;
  mobileHtml: string;
  className?: string;
}) {
  const desktop = desktopHtml.trim() || mobileHtml.trim();
  const mobile = mobileHtml.trim() || desktopHtml.trim();
  const hasCreative = Boolean(desktop || mobile);

  const [variant, setVariant] = useState<BannerAdVariant | null>(null);

  useEffect(() => {
    if (!hasCreative) return;
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setVariant(mq.matches ? 'desktop' : 'mobile');
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [hasCreative]);

  if (!hasCreative) return null;

  if (!variant) {
    return (
      <aside
        className={`site-banner-ad${className ? ` ${className}` : ''}`}
        aria-label="广告"
        aria-busy="true"
      >
        <div className="site-banner-ad-reserved" aria-hidden="true" />
      </aside>
    );
  }

  const html = variant === 'desktop' ? desktop : mobile;
  if (!html) return null;

  return (
    <aside
      className={`site-banner-ad${className ? ` ${className}` : ''}`}
      aria-label="广告"
    >
      <HtmlAd
        key={variant}
        html={html}
        documentSrc={htmlAdDocumentPath({
          kind: 'banner',
          id: bannerAdDocumentId(placement, variant),
        })}
      />
    </aside>
  );
}
