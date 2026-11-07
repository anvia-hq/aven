# 0152: A thread can be continued on another runner

Status: accepted. Builds on 0093 (a project moves to another runner; a started thread stays), 0135 (forks) and 0030 (the diff).

## Context

A thread's workspace, sandbox, journal and uploads are on the runner it began on (0093), so moving the project changes only new threads, and a thread whose runner is gone or too small cannot go on elsewhere. Copying that state between machines is not possible: runners only connect out to the control plane.

## Decision

- `POST /threads/:id/continue` with `{ runtimeId }` (and the model choice, as a message has) makes a new thread, for the creator only, in the same project on another runner, and starts its first run at once (`threads/continuation.ts`). It is not a fork: it has no parent, and the old thread is left as it is, not archived.
- The new thread starts from a fresh clone on its own branch. The old thread's work comes as a patch: the control plane reads the old thread's whole change (`diff.get`, scope `all`: its commits and its uncommitted work against the default branch) through the old runner and sends it as `/uploads/previous-thread.patch` with the first message, which tells the agent to `git apply --3way` it. If the old runner cannot be reached, or the patch is truncated or over 4 MiB (measured in bytes), no patch is sent and the prompt says so, naming the old branch to fetch if it was pushed. Binary files are not in a patch.
- The first message is `[continued] Continued from "<title>", now on <runner>`, then the instructions and the latest turns of the old thread that fit in about 14,000 characters (each cut to 2,000, `protocol/continuation.ts`), fenced as a record that is not the person's instruction. The platform draws its first line as one quiet note, like the fork and process notes (`systemNoteOf`).
- Refused with a 409 when the thread is already on that runner, the target is offline, the agent is working on the thread or waits for an answer; a runner of another workspace is not found.
- The Environment card has a "Continue on another runner" button for the creator, offering the online runners other than the thread's own, with what does not move said in the dialog.

## Consequences

- What does not move: the sandbox, processes, installed tools and the setup snapshot (the first thread on a runner runs `.aven/setup`), the model's exact history (only a summary) and binary files.
- The old thread stays on its runner and can still be read and driven there, so it costs nothing to try.
- A new thread that could not start is archived and put away like any archived thread (its run stopped, its sandbox freed).
- The patch holds the old workspace's uncommitted files, secrets included, and goes to the runner picked: any runner of the workspace is trusted with a project's files already (decision 0093), but pick one you trust.
- The new thread uses the model the old thread's composer showed, else the person's default.
