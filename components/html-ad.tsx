'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_AD_HEIGHT,
  htmlAdFitScale,
  htmlAdSlotPaddingBottom,
  resolveAdDimensions,
  type AdDimensions,
} from '@/lib/ad-dimensions';
import {
  buildHtmlAdSrcDoc,
  parseHtmlAdSizeMessage,
  HTML_AD_SANDBOX,
} from '@/lib/client/html-ad';
import { htmlAdDocumentUrl } from '@/lib/html-ad-document';

/** Render admin-authored HTML, including document.write / async ad scripts. */
export function HtmlAd({
  html,
  documentSrc,
  className = '',
  fill = false,
  fitParent = false,
  minHeight = 72,
  width = 0,
  height: creativeHeight = 0,
}: {
  html: string;
  /** Same-origin HTTP document so alliance scripts see https location.protocol. */
  documentSrc?: string;
  className?: string;
  fill?: boolean;
  /** Scale the creative to the parent box instead of capping at native CSS pixels. */
  fitParent?: boolean;
  minHeight?: number;
} & AdDimensions) {
  const reactId = useId();
  const messageId = useMemo(() => reactId.replace(/:/g, ''), [reactId]);
  const dimensions = useMemo(
    () => resolveAdDimensions({ width, height: creativeHeight, html }),
    [width, creativeHeight, html],
  );
  const fixed = dimensions.width > 0;
  const useFill = fill && !fixed;
  const src = useMemo(
    () => (documentSrc ? htmlAdDocumentUrl(documentSrc, messageId, { fluid: useFill }) : undefined),
    [documentSrc, messageId, useFill],
  );
  const srcDoc = useMemo(
    () =>
      src
        ? undefined
        : buildHtmlAdSrcDoc(html, messageId, dimensions, '', useFill),
    [src, html, messageId, dimensions, useFill],
  );
  const initialHeight = Math.min(MAX_AD_HEIGHT, Math.max(1, minHeight));
  const [height, setHeight] = useState(initialHeight);
  const [scale, setScale] = useState(1);
  const [fillBox, setFillBox] = useState({ width: 0, height: 0 });
  const frame = useRef<HTMLIFrameElement>(null);
  const slot = useRef<HTMLDivElement>(null);

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

  useLayoutEffect(() => {
    const node = slot.current;
    if (!node) return;
    if (fixed) {
      const update = () => {
        const next = node.clientWidth;
        if (next > 0) {
          const fitted = htmlAdFitScale(next, dimensions.width);
          setScale(fitParent ? fitted : Math.min(1, fitted));
        }
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(node);
      return () => observer.disconnect();
    }
    if (!useFill) return;
    const update = () => {
      const nextWidth = node.clientWidth;
      const nextHeight = node.clientHeight;
      if (nextWidth > 0 && nextHeight > 0) {
        setFillBox((current) =>
          current.width === nextWidth && current.height === nextHeight
            ? current
            : { width: nextWidth, height: nextHeight },
        );
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fixed, fitParent, useFill, dimensions.width, html, srcDoc, src]);

  const iframe = (
    <iframe
      key={src || srcDoc}
      ref={frame}
      title="广告"
      width={fixed ? dimensions.width : fillBox.width || undefined}
      height={fixed ? dimensions.height : fillBox.height || undefined}
      {...(src ? { src } : { srcDoc })}
      sandbox={HTML_AD_SANDBOX}
      referrerPolicy="no-referrer-when-downgrade"
      scrolling="no"
      style={
        fixed
          ? {
              position: 'absolute',
              top: 0,
              left: 0,
              width: dimensions.width,
              height: dimensions.height,
              maxWidth: 'none',
              border: 0,
              display: 'block',
              background: 'transparent',
              transformOrigin: 'top left',
              transform: `scale(${scale})`,
            }
          : useFill
            ? {
                position: 'absolute',
                top: 0,
                left: 0,
                width: fillBox.width || '100%',
                height: fillBox.height || '100%',
                maxWidth: 'none',
                border: 0,
                display: 'block',
                background: 'transparent',
              }
            : {
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                maxWidth: 'none',
                border: 0,
                display: 'block',
                background: 'transparent',
              }
      }
    />
  );

  if (useFill) {
    return (
      <div
        ref={slot}
        className={className}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden' }}
      >
        {iframe}
      </div>
    );
  }

  if (fixed) {
    return (
      <div
        ref={slot}
        className={className}
        style={
          fitParent
            ? { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden' }
            : {
                width: '100%',
                maxWidth: dimensions.width,
                marginInline: 'auto',
              }
        }
      >
        {fitParent ? (
          iframe
        ) : (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 0,
              paddingBottom: htmlAdSlotPaddingBottom(dimensions.width, dimensions.height),
              overflow: 'hidden',
            }}
          >
            {iframe}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        marginInline: 'auto',
        height,
        maxHeight: MAX_AD_HEIGHT,
      }}
    >
      {iframe}
    </div>
  );
}
