import { MAX_AD_HEIGHT, normalizeAdDimensions, type AdDimensions } from '@/lib/ad-dimensions';
import { HTML_AD_RUNTIME } from './html-ad-runtime';

export const HTML_AD_MESSAGE_TYPE = 'hw-ad-size';
export const HTML_AD_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation';

export function buildHtmlAdSrcDoc(html: string, messageId: string, dimensions: AdDimensions = {}, clickUrl = ''): string {
  const { width, height } = normalizeAdDimensions(dimensions);
  const config = JSON.stringify({ id: messageId, width, height, clickUrl: clickUrl.trim() }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
#hw-ad-content{display:flow-root;position:relative;transform-origin:top left;${width ? `width:${width}px;height:${height}px;overflow:hidden` : 'width:100%;min-height:0'}}
img,video{max-width:100%;height:auto}iframe{border:0}
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
export function buildPlayerHtmlAd(html: string, clickUrl = ''): string {
  const srcdoc = buildHtmlAdSrcDoc(html, 'player-ad', {}, clickUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<iframe title="广告" sandbox="${HTML_AD_SANDBOX}" referrerpolicy="no-referrer-when-downgrade" scrolling="no" src="about:blank" data-html-ad-srcdoc="${srcdoc}" style="display:block;width:100%;height:100%;border:0;background:transparent"></iframe>`;
}

export function setPlayerHtmlAdsActive(root: ParentNode | null | undefined, active: boolean): void {
  root?.querySelectorAll<HTMLIFrameElement>('iframe[data-html-ad-srcdoc]').forEach((frame) => {
    const source = frame.getAttribute('data-html-ad-srcdoc');
    if (active && source && !frame.hasAttribute('srcdoc')) frame.srcdoc = source;
    if (!active && frame.hasAttribute('srcdoc')) frame.removeAttribute('srcdoc');
  });
}
