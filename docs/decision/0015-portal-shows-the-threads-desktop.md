# The portal shows a thread's desktop and lets a person take it over

Status: accepted. Builds on 0008 (runtimes), 0010 and 0012 (per-thread sandboxes) and 0014 (the KDE desktop image).

## Context

The agent works on a thread's desktop (a KDE Plasma session in the sandbox, driven with screenshots, clicks and keys). A person could not see it, and could not step in. The thread page should show the desktop beside the conversation, live, and let a person take over.

A runner only connects out to the control plane, so a browser cannot reach it directly.

## Decision

- **The desktop is streamed over the runtime WebSocket (wire version 5).** The control plane sends `desktop.open {viewerId, threadId}`; the runner opens the daemon's VNC tunnel (`SandboxDesktop.openViewer`) and relays it as **binary frames** (a 16-byte viewer id, then the bytes) in both directions, and answers `desktop.opened`/`desktop.closed`. The control plane can now call the runner as well (`desktop.status`, `desktop.takeover`, `desktop.release`), answered with `reply`. A runner never starts a sandbox to be watched: a thread whose container is not running has no desktop, and viewing it says so.
- **The browser connects to `GET /threads/:id/desktop/stream`**, a WebSocket carrying the VNC session in binary messages with the `binary` subprotocol that noVNC offers. It is refused before the upgrade unless the caller has a session, is a member of the thread's organization (a thread of another organization is 404) and comes from a trusted origin (`TRUSTED_ORIGINS`). `GET /threads/:id/desktop` reports whether the desktop is there and whether the caller holds it; `POST .../takeover` and `.../release` go to the runner with the caller's user id as the holder.
- **The page draws it with noVNC** (`@novnc/novnc`, MPL-2.0, added to `apps/platform` after asking), in a Desktop panel beside the conversation. The header's Desktop button shows and hides it without remounting the conversation. The desktop is scaled to fit and **never resized**, because the agent's screenshots and clicks are in the desktop's own coordinates.
- **Watching is read-only; Take over pauses the agent.** Taking over uses the daemon's control lock: the agent's inputs fail until the person gives it back. The lease is 60 seconds and the page renews it every 20 seconds while it is in control and releases on Give back, leaving the page, or `pagehide`; a closed tab's lease runs out.
- **A watched sandbox is not idle.** The runner does not free a thread's container (decision 0010) while a viewer is open.
- **What a runtime answers is checked** by the control plane before use, binary frames are accepted only for viewers that connection opened, a browser too slow to keep up is closed (8 MiB buffered), and the runner stops reading the desktop while its link is backed up.

## Consequences

- **Read-only is enforced in the page, not on the wire.** The relay passes the browser's bytes to the desktop as they are, so a signed-in member who bypasses the page can send input without the lock. They could already instruct the agent to do the same, so this is not new access; the lock exists to stop the agent and a person fighting over the pointer, not to authorize. Filtering RFB input messages in the control plane would enforce it and is not done.
- **An open Desktop panel keeps a 2 GB container alive** for as long as it is open, because the sandbox is not idle while watched.
- A member can hold control for up to a minute after closing a tab, since only the lease ends it.
- A runner is asked for at most 32 viewers at once. There is no limit per person, so one member can use them all.
- Every viewer's bytes pass through the control plane; the runner link is the shared bottleneck.
- e2e checks the browser, the proxy, the control plane and the wire with a fake runner (`e2e/fake-runner.ts`) that serves a pretend VNC desktop. The real KDE desktop was checked by hand, through a real runner and container.
