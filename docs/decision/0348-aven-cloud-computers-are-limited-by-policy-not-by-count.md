# Aven Cloud computers are limited by policy, not by count

Status: accepted. Supersedes the "Limits are Aven's" line of decision 0299.

## Context

A workspace could hold 20 Aven Cloud computers (`AVEN_CLOUD_MAX_SANDBOXES`), counted when a thread started. The count was every computer not yet deleted, so the ones of archived threads, which Aven had already stopped, and the ones idle for a day, counted as much as a computer at work. A workspace with 20 old threads could not start a new one while nothing ran. A stopped computer costs the platform little: what costs is the time a computer runs and the disk it keeps.

## Decision

- **A workspace has no limit on its computers.** Starting a thread never fails because of how many computers exist.
- **Archiving already stops the computer** (the thread is put away, and the sandbox is stopped when no open thread is left on it). The disk stays until the 48 hours of 0299 pass, so unarchiving and writing resumes it.
- **Time is recorded, not counted.** Every interval a computer runs is a row of `computer_usage` (workspace, person, provider, start, stop), written where Aven starts and stops it. Limits and plans read it.
- **Settings are the platform owner's, in Settings > Sandbox, and apply without a restart.** They are stored in `platform_settings` and fall back to the environment variables that held them before:
  - stop after the agent has been idle (default 5 minutes, `AVEN_CLOUD_AGENT_IDLE_SECONDS`) and after the person has (20 minutes, `AVEN_CLOUD_USER_IDLE_SECONDS`);
  - delete a computer after this many hours without use (48);
  - the most computers a workspace may have running at once (off);
  - the starts a person may make (a burst, then one every so many minutes) (off).
- **Limits are off unless the owner turns them on, and they count running computers only** (the open intervals of `computer_usage`). A start over a limit waits up to a minute for room, and is refused with when to try again after that.
- **One seam decides.** A computer is admitted when it boots (a new one, or a stopped one waking), not when its thread is made. `admit` in the control plane reads those settings and allows, delays or refuses the start; then the edition's own `admit`, if it has one, can too. The hosted edition supplies that, which is where a plan's hours belong (decision 0299: the open repository never imports the hosted one).
- A refusal by a limit says which limit it was and when to try again.

## Consequences

- Cost is bounded by running time, which idle stop and the 48 hours already keep short, and by limits an owner chooses.
- An installation that wants the old behavior sets a maximum of running computers; its count now ignores stopped ones.
- `AVEN_CLOUD_MAX_SANDBOXES` no longer does anything. The idle variables keep working as the defaults until a value is saved in the UI.
