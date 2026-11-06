# The first thread after an update waits for its environment

Status: proposed. Nothing here is built. It follows decision 0043 (a repository sets its environment up) and decisions 0127 and 0128 (spare workspaces, a thread's workspace and container got ready while the agent starts).

## What a person sees

The first thread on a project after a release that changes the sandbox image has an agent whose first tool call takes minutes, with nothing in the thread saying why. Later threads on that project start in seconds.

Measured on the homelab, 2026-11-06, a thread on a project whose repository has `.aven/setup` (dependencies, PostgreSQL 17, Chromium for the e2e suite), right after `aven update` to 0.5.1:

| Step                                                                            | Time           |
| ------------------------------------------------------------------------------- | -------------- |
| Prompt sent, the model asks for its first tool                                  | 2.6 s          |
| `.aven/setup` runs in a setup container                                         | about 1 minute |
| The setup container is saved as a snapshot (`docker commit` of a 12.2 GB image) | about 2m14s    |
| The thread's workspace is restored and its container started from the snapshot  | about 35 s     |
| **The first tool call, waiting for all of the above**                           | **3m47s**      |

Read from the run journal's events (`tool_started` to `tool_completed`), the snapshot's setup log and its files' times; no chat text.

## Why

A snapshot is used only for the sandbox image it was made from (`baseImageId` in its `meta.json`, `snapshots.ts`). A release that ships a new sandbox image, which is every release, makes every project's snapshot stale, and the next thread on each one runs the setup again and saves a new snapshot before its agent's tools can run (the tools wait on the sandbox: `awaitingReady` in `late-bound-tools.ts`).

Each environment image is 10 to 12 GB, and an update leaves a new one per project in use. On that machine the disk was 77% used with 26 GB free.

## Ideas, in the order worth trying

1. **Start before the snapshot is saved.** Once the setup has finished, the thread's container can be the setup container's result already; saving the snapshot for the next thread does not have to hold this one. Cuts the wait to about the setup's own minute. The snapshot is then written while the agent works, so a second thread started in that window must wait for it or run its own setup (one setup at a time per repository already holds).
2. **Say what the wait is.** The thread shows nothing while its first tool waits. A line such as "Setting up the environment…" with the time so far, in the place the Working indicator is, says it is not stuck. This needs a runner event (an optional field of an existing message, so no wire version bump).
3. **Keep a snapshot across an update that did not change the image's contents.** Compare the new sandbox image with the old one by what the release changed, not by its id. Riskier: the environment is built on the image, so a wrong "same" runs an environment on a base it was not made for. Only worth it if 1 and 2 are not enough.
4. **Prune.** Remove a project's stale snapshot images when its new one is saved, and say what is kept, so updates do not fill the disk. Check first what already happens to the old image.

## Not decided

Whether 1 changes what "a failing setup does not fail the thread" means when the snapshot is saved after the thread has started, and what a person sees if saving it fails.
