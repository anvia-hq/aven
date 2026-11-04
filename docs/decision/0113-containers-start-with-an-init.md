# Sandbox and setup containers start with an init

Status: accepted. Extends 0037 (the 1024-process limit) and 0043 (setup containers).

## Context

A container's command is PID 1, and the sandbox daemon does not wait on children it did not start. A process the agent kills or abandons leaves its children to PID 1, and they stay as zombies. Zombies count against `--pids-limit`, so a thread that kills many workers (the durable recovery tests do, with SIGKILL) ran from about 490 zombies to 560 and then failed with `EAGAIN` and `forkpty` for the formatter, vitest workers and tmux. Only restarting the container cleared them.

## Decision

`containerBaseArgs` adds `--init` to every container a runner starts, the thread's sandbox and the setup container, so Docker's own init (tini) is PID 1 and reaps what is left to it. The image does not change, so no rebuild is needed; a running container gets it when it is next created.

## Consequences

- Zombies no longer build up against the process limit. A test with real Docker starts containers with and without the flag and counts them (`sandbox.test.ts`).
- Containers made before this change keep running without an init until they are released and made again.
