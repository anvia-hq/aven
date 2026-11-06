# A run starts while its sandbox is got ready, and a spare workspace waits for the next thread

Status: accepted. Adds to 0043 (a repository sets its environment up) and 0119 (a run's start-up is timed and MCP is connected once); follows 0127 (a snapshot is cloned in one call on macOS).

## Context

A run did its start-up one step after another: the thread's workspace (cloned, or restored from its snapshot), then its container, then the two sign-ins, then the agent's first model request. On a local thread that was about nine seconds before the model was asked anything, seven of them the workspace restore (0127 brought that to under one on macOS). Cloud agents avoid this by caching the prepared disk and by keeping environments ready; neither needs the model to wait for them.

## Decision

- **The agent starts without waiting for the sandbox.** `Sandboxes.acquire(thread, repo, { lazy: true })` hands the sandbox back at once and gets the workspace and the container ready in the background (`start` resolves when they are). The run driver does the rest of the preparation (the sign-ins and the mark of what this turn changes) behind the same promise and gives the agent tools that wait for it (`awaitingReady`), so the model's first words, and its decision to call a tool, do not. A sandbox that cannot be had ends the run with why, as before: the run is cancelled with that error.
- **A spare workspace per repository.** Once a thread has its workspace from a repository's snapshot, a moment later (5 seconds, so it does not compete with that thread's start-up) the runner prepares the next one in `<home>/spares/<key>/`: the snapshot restored and the default branch fetched, with the snapshot it came from. The next thread of the repository takes it by moving it into place, which costs no copy, then is brought up to date and put on its own branch as any restored workspace is. A spare of a snapshot that has since been replaced is not used, and the spares of the three repositories used last are kept.

## Consequences

The first output of a thread no longer waits for the workspace or the container, and its first tool call waits for what remains. Each repository with a snapshot costs one more workspace on disk (shared blocks on APFS, a full copy on other file systems) and some background copying after a thread starts. A thread on a repository with no snapshot, or the first one after a snapshot is made, still restores or clones as before.
