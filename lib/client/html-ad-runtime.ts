// Keep the independent Android asset html-ad-runtime.js in sync (browser regression checks both).
export const HTML_AD_RUNTIME = String.raw`
(function () {
  var config = window.__htmlAd;
  var nativeWrite = document.write.bind(document);
  var writes = new WeakMap();
  var markers = new WeakMap();
  var replayed = new WeakSet();

  async function insertHtml(html, marker) {
    var template = document.createElement('template');
    template.innerHTML = html;
    var scripts = Array.from(template.content.querySelectorAll('script'));
    marker.parentNode.insertBefore(template.content, marker);
    for (var inert of scripts) {
      var script = document.createElement('script');
      for (var attribute of inert.attributes) script.setAttribute(attribute.name, attribute.value);
      script.textContent = inert.textContent;
      script.async = inert.hasAttribute('async');
      replayed.add(script);
      var finished = new Promise(function (resolve) { script.onload = resolve; script.onerror = resolve; });
      inert.replaceWith(script);
      if ((script.src || script.type === 'module') && !script.async) await finished;
      if (writes.has(script)) await writes.get(script);
    }
  }

  function write(html) {
    var current = document.currentScript;
    // Parser-time writes retain native streaming and blocking-script semantics.
    if (document.readyState === 'loading' && (!current || (!current.async && !replayed.has(current)))) {
      nativeWrite(html);
      return;
    }
    var owner = current || document.getElementById('hw-ad-content') || document.body;
    var marker = markers.get(owner);
    if (!marker || !marker.isConnected) {
      marker = document.createComment('ad-write');
      if (current && current.parentNode) current.after(marker);
      else owner.appendChild(marker);
      markers.set(owner, marker);
    }
    var previous = writes.get(owner);
    var next = previous ? previous.then(function () { return insertHtml(html, marker); }) : insertHtml(html, marker);
    writes.set(owner, next);
  }

  document.write = function () { write(Array.prototype.join.call(arguments, '')); };
  document.writeln = function () { write(Array.prototype.join.call(arguments, '') + '\n'); };

  document.addEventListener('click', function (event) {
    if (!config.clickUrl || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest('a,button,input,select,textarea,video,audio')) return;
    try {
      var destination = new URL(config.clickUrl, document.baseURI);
      if (/^https?:$/.test(destination.protocol)) window.open(destination.href, '_blank', 'noopener');
    } catch (_) {}
  });

  var frame = 0;
  var previousHeight = -1;
  var previousScale = -1;
  function report() {
    frame = 0;
    var content = document.getElementById('hw-ad-content');
    if (!content) return;
    var width = config.width || Math.max(content.offsetWidth, content.scrollWidth, 1);
    var height = config.height || Math.max(content.offsetHeight, content.scrollHeight, 1);
    var scale = Math.min(1, window.innerWidth / width);
    if (scale !== previousScale) {
      content.style.transform = 'scale(' + scale + ')';
      previousScale = scale;
    }
    var measured = Math.min(600, Math.max(1, Math.ceil(height * scale)));
    if (measured === previousHeight) return;
    previousHeight = measured;
    if (parent !== window) parent.postMessage({ type: 'hw-ad-size', id: config.id, h: measured }, '*');
    if (window.HtmlAdBridge) window.HtmlAdBridge.resize(config.id, measured);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(report); }
  function observe() {
    var content = document.getElementById('hw-ad-content');
    if (!content) return;
    new MutationObserver(schedule).observe(content, { childList: true, subtree: true, attributes: true, characterData: true });
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(content);
    content.addEventListener('load', schedule, true);
    schedule();
  }
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  document.addEventListener('DOMContentLoaded', observe);
})();
`;
