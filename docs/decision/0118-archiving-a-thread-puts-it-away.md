# Archiving a thread stops its work and frees its sandbox

Status: accepted. Partly superseded by 0219: archiving still puts a thread away, but there is no sandbox to free.

## Context

Archiving a thread wrote its `state` and nothing else. A run that was going carried on to the end, and the sandbox stayed up until the runner's idle release, fifteen minutes after its last use (and it could stay for good if the agent had left a server running in it). A thread is put away because its work is not wanted any more, so holding a container and an agent's model calls for it is what archiving was meant to end. On a small runner the containers are the scarce thing: each one asks for 4 CPUs and 8 GB by default (decision 0037).

## Decision

- **Archiving puts a thread away.** `PATCH /threads/:id` with `state: "archived"` stops the run in it and has its runner free the sandbox (`modules/threads/put-away.ts`, made in `composition.ts`). The same happens when a bot archives one on the person's word (`bot.thread`), and for every thread of a project that is deleted (decision 0094).
- **The runner frees the container, not the workspace.** A new call, `sandbox.release` with `{ threadId }` (`packages/protocol/src/runtime-wire.ts`), answers `{ released }`: false when no sandbox was up. The runner's `IdleRelease.releaseNow` waits up to twenty seconds for the run that was just stopped to let go of it, and otherwise leaves it to the idle release, since that run's end starts the clock again. The thread's files stay where they are, as they always have; reopening it (decision 0114) starts a sandbox from its environment snapshot when one was kept (decision 0043).
- **Nothing is held by it.** The archive request answers as soon as the database has it; the stop and the release are made in the background, and a runner that is not connected has no container to free (a starting runner removes its own).
- **No wire version change.** A runner of an older release refuses the call; the warning is logged and the sandbox goes on its idle clock, as before. The control plane and runners of one release behave as this describes.
- **The Desktop and the Terminal end with it.** Their streams are to a container that is gone; a viewer the person has open closes as it does when a sandbox is released.

## Consequences

- A shared thread's readers see the conversation, files and changes as before; only its creator could archive it.
- A run that is archived mid-flight is filed like a cancelled one (`run-driver.ts`), so what it did stays in the thread.
- Reopening by writing in the thread (0114) costs a sandbox start, as waking one does.
