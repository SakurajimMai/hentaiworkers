'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  buildHtmlAdSrcDoc,
  parseHtmlAdSizeMessage,
} from '@/lib/client/html-ad';

/** Render admin-authored HTML, including document.write / async ad scripts. */
export function HtmlAd({
  html,
  className = '',
  fill = false,
  minHeight = 72,
}: {
  html: string;
  className?: string;
  fill?: boolean;
  minHeight?: number;
}) {
  const reactId = useId();
  const messageId = useMemo(() => reactId.replace(/:/g, ''), [reactId]);
  const srcDoc = useMemo(() => buildHtmlAdSrcDoc(html, messageId), [html, messageId]);
  const [height, setHeight] = useState(minHeight);

  useEffect(() => {
    setHeight(minHeight);
    const onMessage = (event: MessageEvent) => {
      const next = parseHtmlAdSizeMessage(event.data, messageId);
      if (next != null) setHeight(Math.max(minHeight, next));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [messageId, minHeight, html]);

  return (
    <iframe
      title="广告"
      className={className}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-same-origin"
      referrerPolicy="no-referrer-when-downgrade"
      scrolling="no"
      style={
        fill
          ? { width: '100%', height: '100%', border: 0, display: 'block', background: 'transparent' }
          : { width: '100%', height, border: 0, display: 'block', background: 'transparent' }
      }
    />
  );
}
