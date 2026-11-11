# A person can wake a thread's sandbox from the Desktop panel

Status: superseded by 0219 (the container sandbox, Desktop, Browser and snapshots are retired). Was: accepted. Builds on 0010 (a container per thread, freed when idle) and 0015 (the portal shows the desktop). Changes one sentence of 0015: a runner never starts a sandbox _to be watched_, and still does not; it now starts one when a person asks.

## Context

A thread's container is freed after fifteen idle minutes (0010), so most of the time the Desktop panel said "the thread's sandbox is not running" and offered nothing to do about it. The only way to get a desktop back was to send the agent a message.

## Decision

- **A new runner call, `desktop.wake` (wire version 16).** The runner starts the thread's container exactly as a run would (`Sandboxes.acquire`), without a run, and answers with the desktop's status. The idle clock is then started, so a woken sandbox nobody uses is freed again after the usual idle period; one that is being watched or has a run or a process is kept, as before.
- **A thread with no workspace is not woken.** The repository is cloned by a run, with a token tied to that run (0013); a wake has none. The runner refuses ("The thread has no workspace yet"), and the control plane turns that into a 409 saying the sandbox starts when the agent first works on the thread.
- **`POST /threads/:id/desktop/wake`** (member of the thread's organization, like the other desktop routes) asks the runner and answers with the same body as `GET /threads/:id/desktop`. It waits up to two minutes (`WAKE_TIMEOUT_MS`), longer than the usual few seconds for a call, because the runner itself waits up to 90 seconds for the container's daemon. Any other failure is a 503 with a fixed message; the runner's reason stays in the log, as for takeover.
- **The Desktop panel's "sandbox is not running" notice has a Wake up button** (`modules/desktop/hooks/use-desktop-wake.ts`). It shows a spinner while the container starts and then looks again, and the page shows the desktop. A failure is a toast.

## Consequences

- Anyone in the organization can start a thread's container, which holds up to 8 GB (0037) until it is idle. That is the same reach they have by sending the thread a message.
- A wake of a sandbox that is already running is harmless: it answers with its status.
- Runners and control planes must be upgraded together (wire version 16); an older runner is refused at connect.
