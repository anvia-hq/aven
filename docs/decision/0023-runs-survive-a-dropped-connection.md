# Runs survive a dropped connection

Status: accepted. Changes how [0008](0008-control-plane-runtimes-and-clients.md) treats a runtime that disconnects. Wire version 9.

## Context

When a runner's WebSocket dropped, the control plane ended every run on it and the runner cancelled them, however briefly the link was down. With runs journaled (0021) and goals that can work for a long time (0022), a flaky link should not cost the work.

## Decision

- **The runner keeps working.** A closed socket no longer cancels runs or fails calls in flight. The runner reconnects with backoff as before.
- **Events are numbered.** Every `run.event` and `run.end` carries a `seq` from 1 per run. The runner keeps what each run has said (`run-outbox.ts`, up to 20,000 messages) until the control plane acknowledges the run's end with `run.ack`.
- **The control plane holds the run.** A connection that drops without being cut off hands its runs to the hub, which keeps them for 60 seconds (`graceMs`). Nothing is revoked, so the run's model calls, which go over HTTP, carry on. The channel still shows the run as running.
- **Reconnecting is a conversation.** `hello` now lists `runs`: every run the runtime still holds. The control plane answers each:
  - a run it holds gets `run.attach { after }`: `after` is the last `seq` it heard. The runner replays what came later, in order, and then sends live. Until it is asked, a run's messages are kept, not sent, so a replay cannot interleave with live events.
  - a run it does not follow gets `run.cancel`; its end is acknowledged like any other.
  - a held run the runtime did not list is lost (`The runtime restarted`).
- **Repeats are harmless.** The control plane drops a `seq` it has already heard. `run.end` is acknowledged whether or not the run is followed. Calls still waiting for an answer are sent again on the new connection, and `memory.append` is applied once per `turn`, so a reply lost in the drop does not file a transcript twice. A call has 60 seconds to be answered (it was 30), about as long as a run is held.
- **Cancelling while away.** `RuntimeHub.cancelRun` records a cancel for a held run and sends it once the run is attached again.
- **Cutting a runtime off** (revoked, token rotated, control plane shutting down) still ends its runs at once.

## Consequences

- A link that is down for longer than 60 seconds ends the runs as before. The runner's runs end when it next connects and is told to cancel them.
- A run that says more than 20,000 things while the link is down loses the oldest ones from the replay.
- Only the control plane staying up is covered. If it restarts it knows no run: runners are told to cancel theirs. Continuing a run across a restart of either side needs the run's state kept (decision 0024 for the runner).
- A runner older than version 9 is refused at hello.
