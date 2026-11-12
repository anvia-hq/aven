# A runner's ports are served on aven.run subdomains

Status: proposed. Not built. Replaces the design of 0199, which 0219 retired with the container sandbox.

## Context

An agent starts a dev server, a docs site or a preview on a port of the runner's machine, and a person has no way to open it: a runner only connects out, and a machine's loopback is not reachable from a browser. 0199 solved this for the container sandbox with a relay over the runner's link and a second origin on another port. It listed what that cost: a port is the same site as the app, so cookies are shared; one page per browser; and no wildcard host was available.

Aven now has two domains. `aven.sh` is the product and the app. `aven.run` is free to serve what a runner's machine serves, which is code an agent wrote and anything it pulls from the internet.

A runner is now the person's own machine (0218, 0219), not a container: its loopback holds whatever else runs there, such as a database or a debugger.

## Decision

- **A port is served at `https://<port>-<runtime id>.aven.run`**, one host per port. The domain is set with `AVEN_PREVIEW_DOMAIN`; unset, the feature is off and the platform says it is not set up. Self-hosters bring their own wildcard domain.
- **Nothing from a runner is served from the app's site.** `aven.run` and `aven.sh` are different sites, so a page cannot read or set the app's cookies, and the `aven.run` hosts are never in `TRUSTED_ORIGINS`. The origin guard of 0199 stays. Each host is its own origin, so pages of different ports no longer share cookies or storage, and several can be open at once.
- **A person opens a port, the agent does not.** `POST /runtimes/:id/ports {port}` checks that the person may use the runtime and answers a URL carrying a ticket, signed with the server secret and good for one minute. The host exchanges it for a host-only cookie (no `Domain`, `HttpOnly`, `Secure`, one hour) that names that runtime and port. Every request after that, a WebSocket included, is relayed to the port.
- **A host is private.** Without the cookie a request is refused, whatever the host name reveals. Sharing a page with someone outside the workspace is a later decision.
- **Ports that are not a dev server are refused**: the runner's own, and the well-known ones of a machine's other services (SSH, databases, caches, remote desktop). The person types the port; a list of what is listening is a later addition.
- **The relay is 0199's**: the wire grows `port.open {viewerId, runtimeId, port}` and `port.close` (control plane to runner) and `port.opened` and `port.closed` (runner to control plane), and the bytes go as viewer frames. It reads a request's head, rewrites `Host` and `Origin` to `localhost:<port>`, relays the rest both ways, and turns a `Location` back to `localhost:<port>` into a relative one. 64 open connections per runner, a head over 64 KiB is refused, a browser 8 MiB behind is closed.
- **The control plane serves the hosts first.** The edge sends `*.aven.run` to a listener of the control plane, which relays through the runner's link, so the open code runs as it is with a wildcard certificate. A dedicated edge with tunnels that bypass the control plane is the shape a hosted sandbox product needs; it keeps this host scheme and replaces only the relay.

## Consequences

- A runner and a control plane must share the wire version that adds the port messages (`docs/rules/0005-releasing.md`).
- Every byte of a page passes the control plane and the runner's link until the dedicated edge exists, and each request opens its own tunnel, so large downloads are slow.
- The control plane needs a wildcard certificate and a wildcard DNS record, and its listener must route on `Host`.
- Exposing a port of a person's own machine to the web, even behind a ticket and a cookie, is a larger step than exposing a container's: the refused ports and the "person opens it" rule are what keep it narrow, and both are decided here before anything is built.
- A request with a second pipelined request on one connection is not served; a browser opens another connection.
