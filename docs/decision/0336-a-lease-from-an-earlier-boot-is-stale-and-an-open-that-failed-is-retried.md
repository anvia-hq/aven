# A lease from an earlier boot is stale, and a native backend that failed to open is retried

Status: accepted. Adds to [0330](0330-a-journal-saved-with-a-sandbox-forgets-its-owner.md).

## Context

A Cloud sandbox that is stopped or archived does not shut its runner down: the owner row of its journal keeps the runner's pid. After the next boot the new runner opens the journal and `@anvia/durable` asks whether that pid exists. Pids are small and reused, so another program, or a thread of the new runner itself (on Linux a thread id answers `kill(pid, 0)` like a pid), can hold the number at that moment, and the answer is yes. 0330 only cleared a lease from another host, so this one, from the same host, stayed.

`openAgentBackends` then swallowed the failed open (`native.catch(() => undefined)`) and kept the rejected promise. The runner stayed connected, nothing was logged, and every native run on it failed with "Durable store already has a live owner" until the runner restarted.

## Decision

- **A lease is stale unless its pid is a runner.** On Linux the journal's owner row is cleared when its pid is not a process (`/proc/<pid>/status` has a `Tgid` other than the pid, so it is a thread) or is a process with another name than this one (`runnerHoldsLease`, `lease-holder.ts`). It is the test the sandbox boot script already makes before it kills an old runner (`comm` is `aven`). Without `/proc` (macOS) nothing changes: durable asks whether the pid exists.
- **A second runner on the same journal is still refused**: its pid is a process with this process's name.
- **The native backend opens again when a run asks for it and the last open failed.** The failure is logged when it happens ("The native agent backend could not open its journal: ..."), so it reaches `runner.log`.

## Consequences

- A runner in a sandbox that came back from a stop no longer depends on which number a boot-time process drew.
- A pid that is a live program with this process's name, such as a different `bun` process on a development machine, is still taken for a runner and refused. The retry opens it again on the next run once that program is gone.
- Opening a journal that is really held fails every time a run asks, and logs each time.
