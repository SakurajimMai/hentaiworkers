import { MAX_AD_HEIGHT, normalizeAdDimensions, type AdDimensions } from '@/lib/ad-dimensions';
import { htmlAdDocumentUrl } from '@/lib/html-ad-document';
import { HTML_AD_RUNTIME } from './html-ad-runtime';

export const HTML_AD_MESSAGE_TYPE = 'hw-ad-size';
export const HTML_AD_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation';

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function buildHtmlAdSrcDoc(
  html: string,
  messageId: string,
  dimensions: AdDimensions = {},
  clickUrl = '',
  fill = false,
): string {
  const { width, height } = normalizeAdDimensions(dimensions);
  const config = JSON.stringify({ id: messageId, width, height, clickUrl: clickUrl.trim(), fill }).replace(/</g, '\\u003c');
  const box = width
    ? `width:${width}px;height:${height}px;overflow:hidden`
    : `width:100%;min-height:0${fill ? ';height:100%' : ''}`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}
#hw-ad-content{display:flow-root;position:relative;transform-origin:top left;${box}}
img,video,iframe,ins{max-width:100%}iframe{border:0}
</style>
<script>window.__htmlAd=${config};${HTML_AD_RUNTIME}</script>
</head>
<body><div id="hw-ad-content">${html}</div></body>
</html>`;
}

export function parseHtmlAdSizeMessage(data: unknown, expectedId: string): number | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  if (rec.type !== HTML_AD_MESSAGE_TYPE || rec.id !== expectedId) return null;
  if (typeof rec.h !== 'number' || !Number.isFinite(rec.h) || rec.h <= 0) return null;
  return Math.min(MAX_AD_HEIGHT, Math.ceil(rec.h));
}

/** ArtPlayer inserts HTML strings; an iframe gives embedded scripts a real document. */
export function buildPlayerHtmlAd(html: string, clickUrl = '', documentSrc = ''): string {
  const attrs = `title="广告" sandbox="${HTML_AD_SANDBOX}" referrerpolicy="no-referrer-when-downgrade" scrolling="no" src="about:blank" style="display:block;width:100%;height:100%;border:0;background:transparent"`;
  if (documentSrc.trim()) {
    const src = htmlAdDocumentUrl(documentSrc.trim(), 'player-ad');
    return `<iframe ${attrs} data-html-ad-src="${escapeHtmlAttr(src)}"></iframe>`;
  }
  const srcdoc = buildHtmlAdSrcDoc(html, 'player-ad', {}, clickUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<iframe ${attrs} data-html-ad-srcdoc="${srcdoc}"></iframe>`;
}

export function setPlayerHtmlAdsActive(root: ParentNode | null | undefined, active: boolean): void {
  root?.querySelectorAll<HTMLIFrameElement>('iframe[data-html-ad-src]').forEach((frame) => {
    const source = frame.getAttribute('data-html-ad-src');
    if (active && source && frame.getAttribute('src') !== source) frame.src = source;
    if (!active && frame.getAttribute('src') !== 'about:blank') frame.src = 'about:blank';
  });
  root?.querySelectorAll<HTMLIFrameElement>('iframe[data-html-ad-srcdoc]').forEach((frame) => {
    if (frame.hasAttribute('data-html-ad-src')) return;
    const source = frame.getAttribute('data-html-ad-srcdoc');
    if (active && source && !frame.hasAttribute('srcdoc')) frame.srcdoc = source;
    if (!active && frame.hasAttribute('srcdoc')) frame.removeAttribute('srcdoc');
  });
}
