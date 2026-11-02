# Settings shows a row for each machine, with how loaded it is

Status: accepted. Extends 0008 (runtimes) and 0073 (install and update).

## Context

A workspace can have several runners, the machines that host every thread's and bot's sandbox. Settings > Runtimes says whether each is online and which release it is, but not whether a machine is the reason a thread is slow or will not start: its processors busy, its memory used, its disk full. Sandboxes and workspaces fill a disk quietly, and `devscalelabs-1` was at 79% when it became a runner. The person asked for a row to watch each machine, at the top of Settings' menu.

## Decision

- **A runner reports how loaded its machine is.** A new runner-to-control-plane message, `host.stats` (`HostStats` in `@aven/protocol/runtime-wire`): the processors' share of time busy over the last interval, memory used and total, the disk under the runner's home (where workspaces and snapshots are kept) used and total, the number of cores and how many sandboxes are running. It is sent right after `hello` and every 15 seconds (`statsIntervalMs`). The numbers come from the operating system (`host-stats.ts`: Node's `os` and `statfs`, `/proc/meminfo` on Linux, `vm_stat` on macOS), never from a thread, so there is nothing for an agent to see or change.
- **The control plane keeps only the latest, in memory, with the connection.** `RuntimeHub.statsOf` gives it while the runner is online and `GET /runtimes` returns it as `stats` (or `null`), with `reportedAt`. It is not stored: a load history is a monitoring system's job, and a number that was true a minute ago is not worth a table. A frame with a number a machine cannot have (a percent past 100, a negative size) is dropped like any frame that does not parse.
- **No wire version change.** The control plane already ignores a frame it does not know, so a new runner talking to an older server is not refused, and an older runner simply never reports: its row says so, and that it is behind the server when it is. `WIRE_VERSION` stays 37.
- **The rows are the top of Settings' menu**, a group "Machines" above Personal, one row for each runtime: its name and whether it is online, a Details link to Settings > Runtimes, then the number, a bar of 28 thin upright segments and a footer with arrows that go through CPU, memory and disk, and what is behind the number (cores, or used of total). The sandboxes it holds are beside the number. A meter at 90% or more is drawn in the destructive colour; the fill is a `meter` colour token. Machines at work come first, each group oldest first. A runner that is off, or does not report, is a compact row that says why. The group is hidden when the sidebar is collapsed to icons, and the rows refresh with the runtime list every 10 seconds.

## Consequences

- A runner needs no new setting and `aven update` brings the reporting with the new binary. Until then its row says it is waiting or behind the server.
- The first CPU number after a runner connects covers the few seconds since it started, and a reading the machine cannot give is shown as a dash with an empty bar rather than as zero.
- Disk is the disk of the runner's home, not Docker's own directory. They are the same disk on a default install; a machine that put Docker's data elsewhere will see a number that misses its images.
- Only the runtimes the person's workspace has are shown; the control plane's own built-in runner is one of them.
