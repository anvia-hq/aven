# A restart waits for running threads and says why it ended one

Status: accepted. Builds on [0023](0023-runs-survive-a-dropped-connection.md), [0024](0024-runs-survive-a-runner-restart.md) and [0236](0236-one-control-plane-replica-then-runtime-affinity.md).

## Context

A thread that had finished its work, a pull request merged, ended with "The runtime disconnected". The server's container had been replaced during the run. Runs survive a dropped link (0023) and a runner restart (0024), but the control plane keeps the runs it follows only in memory (`RuntimeHub`, `RunManager`). After it restarts it knows none of them, so a runner that reconnects is told to cancel what it holds, and a run that was open when the process stopped is lost. The message did not say that the control plane was the one that went away, and the only trace was the log of a container that no longer existed.

## Decision

- **A shutdown waits for running threads.** On SIGINT or SIGTERM the control plane refuses new runs ("The server is restarting; try again shortly") and waits for the running ones to end, up to `AVEN_SHUTDOWN_DRAIN_SECONDS` (default 120; `0` does not wait). With nothing running it stops at once. A run still going at the deadline is cancelled as before, and the log says how many.
- **Compose gives it the time.** The server's `stop_grace_period` is 150 seconds, above the drain, so Docker does not kill the process while it waits.
- **A restart says it was a restart.** A run ended because the control plane closed its connections now fails with "The control plane restarted" instead of "The runtime disconnected", which stays the message for a runner that went away.
- **A trace is kept.** A connection that closes with runs open, and a held run given up on after its grace, are logged with the runtime id, the reason and how many runs.

## Not decided here

Keeping the followed runs in Postgres, so a restarted control plane adopts the runs its runners report (`run.attach` from the stored last `seq`) instead of cancelling them, is the way to make a restart invisible to a run. It reaches the run channel, the run's gateway token and identity, and the wire (0023, 0024, `docs/products/0005-runtime-wire-versions.md`), so it needs its own decision. Until then a run longer than the drain is still ended by a restart.

## Consequences

- A restart can take up to two minutes longer while threads work, and a new run in that time is refused with a message that says why.
- A deployment that runs the server in another way than compose sets its own stop timeout above `AVEN_SHUTDOWN_DRAIN_SECONDS`.
