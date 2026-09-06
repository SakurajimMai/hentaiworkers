'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MAX_AD_HEIGHT, normalizeAdDimensions, type AdDimensions } from '@/lib/ad-dimensions';
import {
  buildHtmlAdSrcDoc,
  parseHtmlAdSizeMessage,
  HTML_AD_SANDBOX,
} from '@/lib/client/html-ad';

/** Render admin-authored HTML, including document.write / async ad scripts. */
export function HtmlAd({
  html,
  className = '',
  fill = false,
  minHeight = 72,
  width = 0,
  height: creativeHeight = 0,
}: {
  html: string;
  className?: string;
  fill?: boolean;
  minHeight?: number;
} & AdDimensions) {
  const reactId = useId();
  const messageId = useMemo(() => reactId.replace(/:/g, ''), [reactId]);
  const dimensions = normalizeAdDimensions({ width, height: creativeHeight });
  const fixed = dimensions.width > 0;
  const srcDoc = useMemo(() => buildHtmlAdSrcDoc(html, messageId, { width, height: creativeHeight }), [html, messageId, width, creativeHeight]);
  const initialHeight = Math.min(MAX_AD_HEIGHT, Math.max(1, minHeight));
  const [height, setHeight] = useState(initialHeight);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setHeight(initialHeight);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const next = parseHtmlAdSizeMessage(event.data, messageId);
      if (next != null) setHeight(next);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [messageId, initialHeight, html]);

  return (
    <div
      className={className}
      style={{
        position: 'relative', width: '100%', overflow: 'hidden', marginInline: 'auto',
        maxWidth: fixed ? dimensions.width : '100%',
        aspectRatio: fixed ? `${dimensions.width} / ${dimensions.height}` : undefined,
        height: fixed ? undefined : fill ? '100%' : height,
        maxHeight: MAX_AD_HEIGHT,
      }}
    >
      <iframe
        key={srcDoc}
        ref={frame}
        title="广告"
        srcDoc={srcDoc}
        sandbox={HTML_AD_SANDBOX}
        referrerPolicy="no-referrer-when-downgrade"
        scrolling="no"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', maxWidth: 'none', border: 0, display: 'block', background: 'transparent' }}
      />
    </div>
  );
}
