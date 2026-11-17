# A journal saved with a sandbox forgets its owner

Status: accepted. Adds to [0021](0021-runs-go-through-anvia-durable.md) and [0326](0326-a-project-s-environment-is-a-saved-snapshot-for-72-hours.md).

## Context

A Cloud sandbox runs its own runner, and the runner's journal (`~/.aven/runtime/runs.db`) is on the sandbox's disk. `save_environment` (0326) freezes that disk while the runner is running, so the saved snapshot holds a journal whose owner row names the runner's process and the sandbox's hostname. `@anvia/durable` treats a lease from another host as live without asking whether its process exists, so every sandbox started from the snapshot has a runner that cannot open its journal: "Durable store already has a live owner. Only one runtime per database is supported." Every thread of the project after `setup-env` failed on it.

## Decision

- **Opening the journal clears a lease written on another host**, as it already cleared this process's own (`releaseOwnLease`). A journal is a file on one machine's disk, so a lease from another hostname cannot belong to a live process that shares it: the file was copied or restored.
- A lease from this host with another live pid is left alone: that is a second runner on the same journal, which durable refuses.

## Consequences

- A runner never fails to start because its journal came from a saved snapshot. Runs the snapshot held are ended when the journal opens (0024), as after any restart.
- Projects whose environment was saved before this fix keep the stale lease in their snapshot, and are fixed by the runner in a sandbox started with this release; a new setup-env is not needed.

## And the journal itself does not come along

Clearing the lease is not enough: the snapshot also holds the setup thread's runs, outbox and transcripts, which a runner in the new sandbox would report and resume. A sandbox created from a saved environment (`record.environment` set, in the boat and spaces wake) removes `~/.aven/runtime/runs.db*` (`sandbox/src/fresh-journal.ts`) as soon as it is created, before anything waits for a runner to connect, stopping a boot-time runner service first. A wake that fails after that finds the sandbox and does not clear again, which could wipe a live journal. A sandbox that is only resumed keeps its journal, since 0024 depends on it. What the environment is for (installed dependencies, tools, caches) lives outside those files.
