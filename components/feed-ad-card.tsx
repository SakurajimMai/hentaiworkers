'use client';

import { IconMegaphone } from '@/components/icons';
import { HtmlAd } from '@/components/html-ad';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { feedAdFrameRatio, type AdDimensions } from '@/lib/ad-dimensions';

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
  const frame = banner ? (
    <div className={`poster-frame feed-ad-banner-card w-full min-w-0${custom ? '' : ' feed-ad-card'}`}>
      {custom ? (
        <HtmlAd html={custom} documentSrc={documentSrc} width={width} height={height} />
      ) : (
        <AspectRatio ratio={feedAdFrameRatio({ banner: true, width, height })}>
          <FeedAdPlaceholder href={target} />
        </AspectRatio>
      )}
    </div>
  ) : (
    <div className={`${custom ? 'poster-frame' : 'feed-ad-card'} aspect-[2/3] w-full min-w-0`}>
      <AspectRatio ratio={2 / 3}>
        {custom ? (
          <HtmlAd html={custom} documentSrc={documentSrc} fill className="feed-ad-html" />
        ) : (
          <FeedAdPlaceholder href={target} />
        )}
      </AspectRatio>
    </div>
  );

  if (target && !custom) {
    return (
      <a
        href={target}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={`group block min-w-0${className ? ` ${className}` : ''}`}
        aria-label="广告"
      >
        {frame}
      </a>
    );
  }
  return <div className={`block min-w-0${className ? ` ${className}` : ''}`}>{frame}</div>;
}
