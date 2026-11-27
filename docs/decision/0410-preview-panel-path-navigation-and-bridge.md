# Preview panel path navigation and embedded bridge

Status: accepted. Amends [0237](0237-a-runners-ports-are-served-on-aven-run-subdomains.md) and [0373](0373-the-agent-offers-a-page-and-the-person-opens-it.md). Decided 2026-11-27.

## Context

0237 serves every runner port on its own cross-site origin (`https://<port>-<runtimeId>.aven.run`), and 0373 lets the user or agent open a port in the thread's Browser panel. Because the panel embeds the preview in a cross-origin `<iframe>`, the parent Aven page cannot read `iframe.contentWindow.location`: navigating inside the app left the Browser panel's address bar stuck on the bare root URL, Reload reset the frame to `/`, Open in a new tab always opened `/`, and typing a path in the address bar stripped everything after `/`.

## Decision

- **Paths are first-class across preview opening, offers, and the address bar.** `normalizePreviewPath` (`packages/protocol/src/preview.ts`) accepts safe same-origin `/path?query#hash` values and rejects schemes, protocol-relative URLs (`//`, `/\`), and control characters. `POST /runtimes/:id/ports` accepts an optional `path`, appends it to the ticket URL, and `/__aven/enter` navigates to that normalized path instead of hardcoding `/`. `open_browser` accepts an optional `path`.
- **The Browser panel tracks live navigation through a same-origin bridge script.** For embedded preview sessions only (the partitioned `aven-preview-embed` cookie, never top-level tabs), the preview proxy serves `/__aven/bridge.js` after cookie and `Sec-Fetch-Site` verification, strips `Accept-Encoding` on embedded HTML document requests, and appends `<script src="/__aven/bridge.js" defer></script>` to uncompressed 2xx `text/html` responses (`Content-Length`, `Transfer-Encoding: chunked`, and close-delimited) without buffering the full document.
- **Origin-verified `postMessage` keeps the bar, Back/Forward, Reload, and Open in a new tab in sync.** The bridge reports `{ type: "aven:preview:location", path, canGoBack, canGoForward }` on load, `history.pushState`/`replaceState`, `popstate`, `hashchange`, `pageshow`, and Navigation API changes. The parent verifies `event.source` and the exact preview origin before updating the address bar (skipping overwrites while the user is editing). Commands (`back`, `forward`, `reload`, `navigate`, `sync`) are only accepted by the bridge from configured trusted app origins (`BETTER_AUTH_URL`, `TRUSTED_ORIGINS`).
- **Changing path on an already-confirmed port needs no second confirmation dialog.** Submitting a different path on the open port navigates immediately; changing to a different port still shows 0237's confirmation dialog. Reload and Open in a new tab preserve the current path.

## Consequences

- Top-level preview tabs, API calls, non-HTML assets, WebSockets, and compressed responses remain byte-transparent.
- Appending an external same-origin `<script defer>` at EOF avoids mutating `<head>`/`<body>` children before hydration and works under `script-src 'self'`, though apps with strict nonce-only `script-src` fall back gracefully to typed path navigation without live bar sync.
- When the preview relay moves to a dedicated edge service (0237), it carries `/__aven/bridge.js` and embedded HTML tail injection alongside the enter endpoint.
