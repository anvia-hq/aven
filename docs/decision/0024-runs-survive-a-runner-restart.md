# Runs survive a runner restart

Status: accepted. Builds on [0021](0021-runs-go-through-anvia-durable.md) and [0023](0023-runs-survive-a-dropped-connection.md).

## Context

0023 keeps a run going through a dropped link. A runner that restarts loses its process, but the journal (0021) still has the run: what it needs is to know which wire run it was, what the control plane has heard of it, and how to build its agent again.

## Decision

- **A state file beside the journal** (`<journalPath>.state`, SQLite, `run-outbox.ts` and `run-records.ts`) holds, per wire run:
  - the **outbox**: every message the run sent the control plane, numbered, each tagged with the journal event it came from;
  - the **record**: the thread, the model grant, the prompt (or that it answers a question), the agent id, the run's id in the journal, how much of the transcript was filed, and whether it is over.
    Both are removed when the control plane acknowledges the run's end.
- **The runner says what it holds.** `hello` lists the runs in the outbox. When the control plane asks for one (`run.attach`, 0023) and this process is not running it, the run is taken up again (`run-driver.ts`, `restore`): the thread's sandbox is acquired, the agent is built from the record, registered with durable under its old id, and the journal run is revived (`DurableRuns.rejoin`).
- **It goes on from exactly where the control plane stopped hearing.** The cursor into the journal is the newest journal event that run already reported, read from the outbox, not stored on its own, so the two cannot disagree. Journal events before it are fed to the event mapper without being sent, so a tool's result still finds its call. The numbering carries on from the outbox's.
- **Reviving a run.** `resume` parks every unfinished run whose agent is not registered as needing attention; once a run's agent is registered, those are retried. A tool call that was in flight is not repeated unless it is safe (reads, `write_file`): the run is told its outcome is unknown. The model request that was in flight is sent again, and may be billed twice. Its text can show twice in the client, as with any retried attempt.
- **Runs nothing asks for are ended** when the journal opens: those whose agent no record names.
- **The control plane gives up on a restart that takes too long.** It holds a run's connection for its grace period (0023); a runner that is not back by then has its runs ended when it reports them.
- **A control plane that does not follow a run** tells the runner to cancel it. A run this process does not have is cancelled in the journal and its end is reported, so it is acknowledged and forgotten.

- **A goal continues too.** The record has the run's phase (the agent's turn, the goal, the report on it), the goal request, the goal's task in the journal, and each session it has seen (its number, and whether its messages were filed). Taken up again, the goal is submitted with the same ids, which gives the task that is already there; its session runs are revived once the goal's agent is registered and its assessment can use the sandbox again. Sessions already filed are skipped; one a restart interrupted goes on from the last event it reported, under its old number, without a second divider. The report turn is taken up the same way.

## Consequences

- The model grant in the record is a credential for as long as the control plane holds the run. The state file is the runner's own and is not group- or world-readable.
- A run's model grant is reused, not re-issued: a restart longer than the control plane's grace period ends the run.
- Only the runner's restart is covered. A control plane restart still ends its runs (it knows none of them afterwards).
