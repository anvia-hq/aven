# 0144: A process that ends wakes the agent

Status: accepted, widened by decision 0147. Changes one rule of decision 0012 (a finished process does not restart a run) and builds on 0137.

## Context

The agent that starts a long job (a test run, a build) had only two ways to hear that it ended: wait with `wait_for_process`, a call that holds the turn open and shows the thread as working for as long as it takes, or poll. Claude Code does not make the agent wait: the agent starts the command in the background, ends its turn, and is started again when the process exits.

## Decision

- When a run ends normally (not cancelled, not stopped for a question or an error), the runner watches the processes it left running in the thread's sandbox, looking every three seconds.
- When one ends while the thread has no run, the runner sends `process.ended` (wire version 48): the process, how it ended, how long it ran and the end of its output, as the agent would see it (the run's secrets hidden). The control plane checks that the thread is the runner's and not archived, and sends the thread's owner's agent a note that starts with `[process]`, not as the person's word (`onPersonsWord: false`): a new run of the thread starts with it, on the person's default model.
- A new run drops the watch; its end sets it again with what is then running. A process the person stops themselves does not wake the agent. A process that ends while a run is going is not told of: that run sees it with its own tools.
- The agent is told to start a long job in the background, say what it will do when the job ends, and end its turn instead of waiting; that a process that never ends (a server) wakes it for nothing; and to keep `wait_for_process` for a result it needs inside the same step. The platform draws a `[process]` or `[fork]` message as one quiet line, not as something the person said.

## Consequences

- A thread waiting for a job is idle, not working: no spinner, no turn held open, no polling.
- The agent that wakes has its history, but runs on the default model and not the one the earlier run chose, as for a fork.
- The message is not repeated if the link is down when the process ends, and a runner that restarts forgets what it watched: the agent then waits or looks, as before.
- A process that ended in the moment between the agent's last look and the run's end is not told of; the agent started it and ended its turn, so it should wait for one that short.
- A thread with a running process keeps its sandbox past the idle time (decision 0118), so a long job is not cut off by the idle release.
