# A thread lives on one runner

Status: accepted. Builds on 0011 (a thread copies its project's runner), 0021 (the runner journals its runs), 0030 (the diff), 0043 (a repository's environment snapshot), 0093 (a project can move to another runner) and 0152 (a thread continues on another runner).

## Context

The control plane keeps a thread's row and the transcript people read, but almost nothing the thread is working with. That is on the runner the thread began on: `threads.runtime_id`, copied from the project at creation (a fork's from its parent) and never changed, and every call about a thread, a file, a diff, a process, an artifact, a desktop, a terminal or a run, goes to that runner and to no other (`runnerFor` in `runtimes/ask-runner.ts` resolves it, and a runner that is not connected is an error, not a reason to look elsewhere). No document set out all of what that state is, so it stayed easy to write a change that assumes a run, a workspace or an environment image is somewhere else, and a run the control plane still believed in could be attached to a runner that had never heard of it and simply hang there.

## Decision

A thread's state on its runner, under `AVEN_RUNTIME_HOME`:

- `runs.db` is `@anvia/durable`'s journal (`journalPathIn`, `<AVEN_RUNTIME_HOME>/runs.db`) and holds each run's model history: submissions, model responses, tool results and progress events, which is what lets a run go on after the runner restarts, and what keeps a run parked while it waits for an answer (0021). Compaction writes its summary here too.
- `runs.db.state` is the SQLite database beside it (`statePath`, `${journalPath}.state` unless the caller says otherwise, so `<AVEN_RUNTIME_HOME>/runs.db.state`). It holds what is not the model's history: a record per run (`runs`: its thread, prompt, model, skills, memory, compaction flag, goal and goal state, durable id, turn and phase), the outbox of events the control plane has not acknowledged (`outbox`, `outbox_runs`), and the processes the runner watches for the thread (`process_watch`). `hello` reports the outbox's runs, so a reconnected control plane learns from this file which runs the runner can still take up.
- `environments/<thread id>.image` is the image the thread keeps, so a container made later is made from the image the thread started from: a setup snapshot's image when the repository has one, else the sandbox image (0043).
- `refs/aven/turn` marks the working tree when a run starts, so `diff.get` with scope `turn` can show the last turn's changes (0030), and `refs/aven/fork-base` marks the tree a fork's copy started from (0135).
- `.git/aven-forks/<8 characters of the fork's id>.patch`, in the parent's workspace, is the whole of a fork's change written out for the parent's agent to apply, since the fork's workspace is a copy and not the same tree (0135).

The same picture beyond those files: the clone in `workspaces/<thread id>` with the agent's branch and its uncommitted work, `uploads/<thread id>`, `artifacts/<thread id>`, `skills/threads/<thread id>`, the thread's container in its sandbox, and the MCP connections kept for it in memory. A thread is therefore not portable between runners. Nothing copies any of this from one machine to another: runners only connect out to the control plane (0152). What does move is a patch and a summary, and it makes a new thread with a fresh clone on another runner, not this one in another place (0152). A project may move to another runner (0093), which decides where its threads to come begin, never where an existing one lives.

- `run.attach` for a run the runner has no record of is answered with the run gone. The run driver opens that run's outbox and reports `run.end` with outcome `error` and the message `The run is gone: this runner has no record of it`, the way every other run-level failure on a runner is reported (`finish` in `run-driver.ts`). The control plane rejects the run with that message, which becomes the thread's `last_error` and ends the run there (0100), and acks the run, which forgets it.

## Consequences

- A runner that lost its `runs.db.state`, or whose record of one run is gone, no longer leaves the control plane holding that run: it fails with a message saying the runner has no record of it, which is what the thread shows.
- A run the control plane has already heard the end of is not answered again: a record marked done leaves `run.attach` quiet, since the outbox still has the end it buffered, or the control plane has acked it and the record is gone.
- Anything that needs a thread's workspace, image, refs or journal has to ask the thread's runner and cannot be built from what the control plane has. A thread whose runner is lost can still be read as far as its transcript goes, and 0152's new thread is the way to go on with its work.
