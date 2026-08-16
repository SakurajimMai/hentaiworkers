/** Helpers for admin-authored HTML ads (including document.write networks). */

export const HTML_AD_MESSAGE_TYPE = 'hw-ad-size';

export function buildHtmlAdSrcDoc(html: string, messageId: string): string {
  const id = JSON.stringify(messageId);
  const type = JSON.stringify(HTML_AD_MESSAGE_TYPE);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
html,body{margin:0;padding:0;background:transparent}
img,video,iframe,ins{max-width:100%}
</style>
<script>
(function(){
  function write(args){
    var html = Array.prototype.slice.call(args).join('');
    if (!document.body) {
      document.documentElement.insertAdjacentHTML('beforeend', html);
      return;
    }
    document.body.insertAdjacentHTML('beforeend', html);
  }
  document.write = function(){ write(arguments); };
  document.writeln = function(){ write(arguments); write(['\\n']); };
})();
</script>
</head>
<body>
${html}
<script>
(function(){
  var id = ${id};
  function report(){
    var h = Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement.scrollHeight, 0);
    if (parent !== window) parent.postMessage({type:${type}, id:id, h:h}, '*');
  }
  try {
    new MutationObserver(report).observe(document.documentElement, {childList:true,subtree:true,attributes:true});
  } catch (e) {}
  window.addEventListener('load', report);
  setTimeout(report, 200);
  setTimeout(report, 1200);
  setTimeout(report, 3500);
})();
</script>
</body>
</html>`;
}

export function parseHtmlAdSizeMessage(data: unknown, expectedId: string): number | null {
  if (!data || typeof data !== 'object') return null;
  const rec = data as Record<string, unknown>;
  if (rec.type !== HTML_AD_MESSAGE_TYPE || rec.id !== expectedId) return null;
  const height = Number(rec.h);
  if (!Number.isFinite(height) || height <= 0) return null;
  return Math.ceil(height);
}
