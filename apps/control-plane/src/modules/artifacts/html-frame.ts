export const HTML_HEADERS = {
  "cache-control": "private, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": [
    "sandbox allow-scripts",
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; "),
};

const BRIDGE = `<script>(function(){var root=document.documentElement;addEventListener("message",function(e){var d=e.data;if(e.source!==parent||!d||d.aven!=="theme")return;var vars=d.vars||{};for(var k in vars)root.style.setProperty(k,vars[k]);root.style.colorScheme=d.scheme==="light"?"light":"dark"});function size(){parent.postMessage({aven:"height",value:Math.ceil(root.getBoundingClientRect().height)},"*")}function start(){new ResizeObserver(size).observe(root);size();parent.postMessage({aven:"ready"},"*")}if(document.readyState==="loading")addEventListener("DOMContentLoaded",start);else start()})()</script>`;

const AFTER = [/<head(\s[^>]*)?>/i, /<html(\s[^>]*)?>/i, /<!doctype[^>]*>/i];

export function framedHtml(text: string) {
  const top = text.slice(0, 4096);
  for (const pattern of AFTER) {
    const found = pattern.exec(top);

    if (found) {
      const at = found.index + found[0].length;
      return text.slice(0, at) + BRIDGE + text.slice(at);
    }
  }
  return BRIDGE + text;
}
