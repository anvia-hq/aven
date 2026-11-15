# 0308. An Aven Cloud sandbox is stopped when it is idle

Status: accepted. Partly supersedes 0299 (a sandbox waited for boat's two-hour auto-stop) and
changes how 0297 and 0306's providers are stopped.

## Context

A sandbox's auto-stop was one wall-clock deadline from its creation or its resume: the provider
stopped it two hours later (`AVEN_BOAT_AUTO_STOP_SECONDS`, `AVEN_SPACES_AUTO_STOP_SECONDS`). Nothing
Aven did moved that deadline, so a busy agent was stopped mid-run once it was two hours old, and a
sandbox nobody had touched for two hours kept a machine and its bill until then. Amp's orbs pause
when nobody is using them; a sandbox should do the same, and only then.

Worse, `sandbox/src/spaces/client.ts` asked spaces to resume with an empty body. Spaces resets
`archiveAfter` from the `ttlSeconds` a resume carries, so a resumed sandbox kept its old, already
past deadline and its reaper stopped it again minutes later. Boat's client sent `ttlSeconds` on
resume; spaces' did not.

## Decision

- **Aven decides when a sandbox stops.** A sweep in the control plane
  (`apps/control-plane/src/modules/runtimes/cloud-idle.ts`, every `AVEN_CLOUD_IDLE_CHECK_SECONDS`,
  60 by default) looks at every live Aven Cloud sandbox whose runner is connected and stops it when
  both of these hold, which is what Amp does with an orb's pause:
  - no agent work for `AVEN_CLOUD_AGENT_IDLE_SECONDS` (300, five minutes): no run on any of its
    threads, and no thread of it written since then. A run in progress always keeps the sandbox,
    however long it has been going;
  - no person has used it for `AVEN_CLOUD_USER_IDLE_SECONDS` (1200, twenty minutes): a message (it
    starts a run and writes the thread), the terminal (opening it and every keystroke), files
    (`GET /threads/:id/files`, `/files/content`, `/files/search`), or a wake-up
    (`POST /threads/:id/computer/wake`). The person's touches of the last three are kept in memory
    (`runtimes/activity.ts`), and the thread's `updated_at` is the durable floor, so a restart only
    makes a sandbox wait one more window rather than stopping it early.
- **A sandbox that is idle in another way is not stopped.** A runner that is not connected has
  nothing to stop; a sandbox the sweep first sees once a server is up waits a whole person window
  (`since`) before it may be stopped.
- **Putting a thread away stops its sandbox at once** when no other open thread is on it
  (`threads/put-away.ts` asks `runtimesService.openThreadsOn`). The 48-hour delete sweep (0299) is
  unchanged: a stopped sandbox is still deleted after 48 idle hours.
- **The provider's own auto-stop becomes a safety net**, for a sandbox Aven is no longer managing: it
  is sent on create as before, sent on resume (spaces' fix), and moved by `PATCH /sandboxes/{id}`
  with `ttlSeconds` while the sandbox is in use, at most every 30 minutes, so a long run is never cut
  by a timer that started when it was created. Both providers take that field (spaces implements
  boat's `PATCH` and `POST /resume` bodies, `docs/api.md` in spaces).
- **The lifetime tracker learns about Aven's own stops.** `SandboxLifetime.stopped` marks the
  sandbox stopped, so `mayHaveStopped` is true at once and the next use wakes it, even while the
  runner's connection is still up. The two providers share `createSandboxLifetime` (`sandbox/src/lifetime.ts`);
  no provider code is shared, as 0306 asks.

## Consequences

- A working agent is no longer cut off at two hours, and a sandbox left alone for twenty minutes
  stops, keeping its disk for the resume.
- The stop is Aven's, so it needs the control plane up. While it is down, the provider's timer stops
  the sandbox after `AVEN_*_AUTO_STOP_SECONDS`, as before.
- The sweep costs one query per check and one `PATCH` per busy sandbox per 30 minutes; a stop is one
  record lookup per provider, as the delete route already did.
- The never-extended `ttlSeconds` a create sends is no longer what keeps a sandbox alive; it is only
  the bound on what Aven has lost track of.
- Not verified against a real boat or spaces server: the `PATCH` extension and the resume body were
  checked against spaces' API (`PATCH /sandboxes/{id}` takes `ttlSeconds`) and boat's contract, and
  the clients' tests, not against a live sandbox. A real wake, idle, stop and resume is the check to
  make before this reaches `main`.
