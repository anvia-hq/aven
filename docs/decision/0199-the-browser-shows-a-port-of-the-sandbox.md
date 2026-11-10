# 0199: The Browser shows a port of the sandbox

Status: accepted. Builds on 0015 and 0053 (a runner relays bytes between a sandbox and the browser as binary frames), 0039 (a person can wake a sandbox) and 0181 (a page the agent wrote runs apart from the app).

## Context

An agent starts a dev server, a docs site or a preview in the sandbox, and a person had no way to see it: only the agent's screenshots of the desktop. The page is on a port of the sandbox's loopback, which no browser can reach: a runner only connects out, and a container publishes nothing.

What the page serves is the agent's own code, and what it pulls from the internet. Shown from Aven's own address, its scripts would run as the person in Aven: the session cookie goes with every request, so a page could read threads and change settings.

## Decision

- **A Browser tab beside Desktop and Terminal opens a port of the thread's sandbox.** The person types a port. Anyone who may read the thread may open it, as for its files and artifacts. Like the desktop and the terminal it never starts a sandbox: a sleeping one is woken with the existing button (0039), and an open page keeps the sandbox from being freed as idle.
- **A connection to the port is a viewer of its own.** The wire grows `port.open {viewerId, threadId, port}` and `port.close` (control plane to runner) and `port.opened` and `port.closed` (runner to control plane), wire version 55. The bytes go as the viewer frames of 0015. The runner uses the sandbox daemon's raw TCP tunnel to loopback (`tunnel(threadId).open(port)`), so nothing is run in the container to carry them. The daemon's VNC port (5900) is refused, since the desktop's control lock would not hold on it.
- **The page is served from an origin of its own.** The control plane listens on a second port (`AVEN_BROWSER_PORT`, 8001 in the container, published as `127.0.0.1:${AVEN_BROWSER_PORT:-2839}`), and `AVEN_BROWSER_ORIGIN` is the address a browser reaches it at (on a tailnet, `tailscale serve --https=8444 http://127.0.0.1:2839` and `https://<host>:8444`). A different port is a different origin, so a page there cannot read Aven's storage, send its requests with credentials that Aven's CORS would answer, or open its sockets (those check the origin). Without `AVEN_BROWSER_ORIGIN` the tab says the Browser is not set up.
- **A person is let in by a ticket, and the page by a cookie.** `POST /threads/:id/browser {port}` checks the thread and the port and answers a URL on the browser origin with a ticket, signed with the server secret and good for one minute. The browser origin exchanges it for a cookie (`HttpOnly`, `SameSite=Lax`, `Secure` on https, one hour) that names the thread and the port, and goes to `/`. Every request after that, a WebSocket included, is sent to that port. The page is drawn in an iframe on the platform, and "open in a new tab" works the same.
- **The proxy is a small HTTP/1.1 relay over the tunnel, not a general server.** It reads a request's head, rewrites it and splices the rest of the bytes both ways, so a WebSocket upgrade (hot reload) is the same path. Every connection carries one request (`Connection: close`). The request goes with `Host` and `Origin` made `localhost:<port>`, which is what dev servers expect (Vite refuses other hosts). The response's `Location` back to `localhost:<port>` becomes a relative one, and `X-Frame-Options` and a CSP's `frame-ancestors` are dropped, since the page is meant to be framed by Aven.
- **Cookies of the page and of Aven stay apart.** A cookie is shared by every port of a host. So the page's own cookies are stored under a prefix (`aven-app.`) and only those, prefix removed, go to the app: Aven's session cookie never reaches the sandbox's code, and the page cannot set a cookie that Aven would read as its own. A page's `Domain` attribute is dropped.
- **Limits.** 64 open connections per runner for ports, apart from the 32 desktops and terminals. A head of more than 64 KiB is refused. A browser too slow to keep up is closed (8 MiB buffered), as in 0015.

## Consequences

- A runner and a control plane must both be 55.
- One page at a time per browser: the cookie names one port, so a second Browser tab, another thread's or another port, takes it over until reloaded. A wildcard subdomain per page would remove that, and is not done: a tailnet has none.
- Pages of one browser origin see each other's cookies and storage (not Aven's).
- Everything the page loads passes the control plane and the runner's link, and every request opens its own tunnel: large downloads are slow.
- A request with a body is relayed as it comes. Nothing is parsed past the head, so a request that sends a second one on the same connection is not served; a browser opens another.
- The port is typed; listing the ports a container listens on is a later addition.
