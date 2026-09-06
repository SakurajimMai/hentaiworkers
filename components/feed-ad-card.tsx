'use client';

import { IconMegaphone } from '@/components/icons';
import { HtmlAd } from '@/components/html-ad';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import type { AdDimensions } from '@/lib/ad-dimensions';

export function FeedAdCard({
  html,
  href,
  width,
  height,
}: {
  html?: string;
  href?: string;
} & AdDimensions) {
  const custom = (html || '').trim();
  const target = (href || '').trim();
  const frame = (
    <div className="feed-ad-card">
      {custom ? (
        <HtmlAd html={custom} width={width} height={height} className="feed-ad-html" />
      ) : (
        <AspectRatio ratio={2 / 3}>
          <div className="feed-ad-default">
            <span className="feed-ad-badge">广告</span>
            <IconMegaphone size={22} className="text-accent" />
            <p className="font-ui text-[15px] font-semibold text-ink">广告位招租</p>
            <p className="mt-1 font-ui text-[12px] leading-relaxed text-soft">
              信息流原生卡
            </p>
            {target ? (
              <span className="mt-3 font-ui text-[12px] font-medium text-accent">查看广告位 →</span>
            ) : null}
          </div>
        </AspectRatio>
      )}
    </div>
  );

  if (target && !custom) {
    return (
      <a
        href={target}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="group block"
        aria-label="广告"
      >
        {frame}
      </a>
    );
  }
  return <div className="block">{frame}</div>;
}
