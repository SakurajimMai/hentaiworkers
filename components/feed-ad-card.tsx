'use client';

import { IconMegaphone } from '@/components/icons';
import { HtmlAd } from '@/components/html-ad';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { feedAdFrameRatio, resolveAdDimensions, type AdDimensions } from '@/lib/ad-dimensions';

function FeedAdPlaceholder({ href }: { href?: string }) {
  return (
    <div className="feed-ad-default">
      <span className="feed-ad-badge">广告</span>
      <IconMegaphone size={22} className="text-accent" />
      <p className="font-ui text-[15px] font-semibold text-ink">广告位招租</p>
      <p className="mt-1 font-ui text-[12px] leading-relaxed text-soft">信息流原生卡</p>
      {href ? (
        <span className="mt-3 font-ui text-[12px] font-medium text-accent">查看广告位 →</span>
      ) : null}
    </div>
  );
}

export function FeedAdCard({
  html,
  href,
  documentSrc,
  className = '',
  banner = false,
  width,
  height,
}: {
  html?: string;
  href?: string;
  documentSrc?: string;
  className?: string;
  banner?: boolean;
} & AdDimensions) {
  const custom = (html || '').trim();
  const target = (href || '').trim();
  const size = resolveAdDimensions({ width, height, html: custom });
  const bannerRatio = feedAdFrameRatio({ banner: true, width: size.width, height: size.height });
  const frame = banner ? (
    <div
      className={`poster-frame feed-ad-banner-card w-full min-w-0${custom ? '' : ' feed-ad-card'}`}
      style={{ aspectRatio: `${bannerRatio}` }}
    >
      {custom ? (
        <HtmlAd
          html={custom}
          documentSrc={documentSrc}
          width={size.width}
          height={size.height}
          fitParent
          className="feed-ad-html"
        />
      ) : (
        <AspectRatio ratio={bannerRatio}>
          <FeedAdPlaceholder href={target} />
        </AspectRatio>
      )}
    </div>
  ) : (
    <div className={`${custom ? 'poster-frame' : 'feed-ad-card'} aspect-[2/3] w-full min-w-0`}>
      <AspectRatio ratio={2 / 3}>
        {custom && size.width > 0 ? (
          // A sized image/alliance creative is letterboxed inside the poster cell instead of being cropped.
          <HtmlAd
            html={custom}
            documentSrc={documentSrc}
            width={size.width}
            height={size.height}
            contain
            className="feed-ad-html"
          />
        ) : custom ? (
          <HtmlAd html={custom} documentSrc={documentSrc} fill className="feed-ad-html" />
        ) : (
          <FeedAdPlaceholder href={target} />
        )}
      </AspectRatio>
    </div>
  );

  const layoutClass = `block min-w-0 self-start${banner ? ' col-span-2' : ''}${className ? ` ${className}` : ''}`;
  if (target && !custom) {
    return (
      <a
        href={target}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={`group ${layoutClass}`}
        aria-label="广告"
      >
        {frame}
      </a>
    );
  }
  return <div className={layoutClass}>{frame}</div>;
}
