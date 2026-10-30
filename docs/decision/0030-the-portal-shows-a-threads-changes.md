# The portal shows what a thread changed, as a diff

Status: accepted. Builds on 0008 (runtimes), 0010 (per-thread workspaces) and 0015 (the Desktop panel, whose call path this reuses).

## Context

The agent edits a clone of the project's repository in the thread's workspace. A person had to read tool calls in the conversation, or open the desktop, to see what it did. The thread page should show the changes as a diff, for the last turn or for the whole thread, and as one column or two.

A runner only connects out to the control plane, and the workspace is a directory on the runner, so the control plane has to ask the runner.

## Decision

- **The runner computes the diff with `git` on the host (wire version 10).** `diff.get {threadId, scope}` is a call like the desktop's. The answer is a unified patch and a `truncated` flag, or null when the thread has no clone yet. It works while the container is released, because the workspace stays. The patch is cut at a line after 2 MiB.
- **Scopes.** `all` compares the working tree with where the thread's branch left the default branch (`merge-base HEAD origin/HEAD`). `turn` compares it with the working tree as it was when the thread's latest run began. Commits the agent makes, and files it has not added, count in both, and ignored files do not.
- **A turn's start is a ref.** When a run starts (not when it resumes after an answer or is picked up again after a restart: that is the same turn), the runner writes the working tree to a commit under `refs/aven/turn`. The tree is built with a scratch index, so the thread's own staging area is untouched. A thread that has not run since this shipped has no start, and its last turn shows nothing.
- **The control plane relays it.** `GET /threads/:id/diff?scope=turn|all` (default `turn`), scoped to the caller's organization like the desktop. A runtime's own error text stays in the log, and an answer of the wrong shape is a 503.
- **The page parses the patch.** The Changes panel, opened by a button beside Desktop, parses it into files and hunks (`modules/diff/parse-patch.ts`) and draws it unified or split, with Last turn and Full diff tabs. Scope and layout are kept in localStorage. While the agent works the panel looks again every four seconds, and once more when the run ends.

## Consequences

- The ref and the scratch index live in the thread's `.git`, which the agent can see and could change. It can only make its own diff wrong.
- Every look at the diff runs `git add --all` against a scratch index, which reads every file that is not ignored. On a very large repository it is slow, and an open panel repeats it every four seconds during a run.
- A diff has no comments, staging or revert; it is for reading.
- Binary files show as changed with no content; a patch past 2 MiB loses its end.
- The panel, the Desktop and the conversation can all be open, and the panels share the width.
