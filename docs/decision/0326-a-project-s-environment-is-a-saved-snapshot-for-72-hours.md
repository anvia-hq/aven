# A project's environment is a saved snapshot, for 72 hours

Status: accepted. Superseded in part by 0392 (every environment row has an `expires_at` and delete-failure backoff). Brings back what 0043 decided and 0219 and 0225 retired, now that Aven Cloud runs a thread's sandbox (0299, 0306) and a sandbox can be started from a provider's saved snapshot. Adds to 0225, whose "there is no snapshot" is true of the person's computer only.

## Context

A thread of a repository project gets a fresh clone of the repository, so nothing git ignores is there: no `node_modules`, no virtualenv, no build output. `.aven/setup` (0225) installs them, but every new thread runs it again, and a project that needs a toolchain, a database or ten minutes of compiling pays it each time.

0043 solved this for the container sandbox with a snapshot kept on the runner, and 0197 added a Take snapshot button. Both went with the container sandbox (0219). Aven Cloud is different in a way that matters: its sandbox providers keep a frozen disk under a name (boat's saved snapshot, spaces' saved snapshot), and a new sandbox can be started from it — `POST /sandboxes` with `from` on both, verified against the real services.

The person's own computer is not in this: it has their files, their tools and their secrets, and nothing may be snapshotted from it or restored onto it (0218, 0225).

## Decision

- **Only a Sandbox runner has an environment.** `save_environment` is offered when the run's provider is `boat` or `spaces` and the run is attended, and never on `manual`. It is not offered to subagents.
- **The tool runs `.aven/setup` itself**, in the thread's sandbox, with a clean environment (`env -i HOME PATH CI=1`), from the workspace root, and fails with the end of the script's output and its exit code. It has 20 minutes. What is kept is what the script makes now, not what the agent accumulated in a session.
- **The snapshot is the provider's, under the project's own name**, `aven-<projectId>`, taken from the sandbox that just ran the script (`POST /saved-snapshots`, `202` and `saving`, then polled by the control plane until `ready` or `failed`). Re-saving replaces the artifact, so the name is stable and nothing piles up.
- **The control plane owns it, not the runner.** The runner reports the digest of `.aven/setup` and the control plane starts and polls the save (`environment.save`), because the provider's key and the sandbox id are the platform's, not the sandbox's. A row per project and provider (`project_environments`) holds the name, the digest, `saving`/`ready`/`failed` and the expiry.
- **A new thread starts from it when it is ready**, 72 hours at most: the runtime row carries `environment_snapshot`, the wake flow passes it as `from`, and the provider starts the sandbox from that frozen disk. A missing, failed or expired environment means a sandbox from the image, which is what every thread got before — never a wrong one.
- **The repository is still made fresh per thread.** The runner clones (or resets) the project as it always does, so what carries over is what the snapshot has outside the checkout: installed dependencies, tools, caches and build output. Another thread's branch, uncommitted changes and anything else in `/workspace` do not.
- **Secrets are injected after the disk is restored**, as before (0229, 0276): GitHub, project variables, identity and MCP credentials are set per run and are never in a snapshot.
- **`.aven/resume` runs per thread, on a sandbox only**, after the workspace and the credentials are ready, for up to 10 seconds, and a failure is logged rather than failing the run. It is thread-specific, so it is not part of the shared snapshot.
- **72 hours, and Aven deletes it.** boat's saved snapshots never expire and spaces' do not either, so a sweep every hour deletes the provider's snapshot and the row once `expiresAt` has passed; a removal the provider refuses keeps the row for the next sweep. A project's delete cascades.
- **Nothing is refused for a saving environment.** A thread made while a save is in flight starts from the image; the next one starts from the snapshot.

## Consequences

- The wire gains `environment.save` (the runner has run the script, here is its digest) and `environment.read` (what this project has, if anything). Both are calls the runner makes, so a control plane that does not know them refuses them and a runner that does not make them is unaffected: `WIRE_VERSION` stays.
- A sandbox that is created from a snapshot costs the plan's saved-snapshot allowance where the provider has one; boat includes 10 per $20 of plan and charges $0.056 a day each beyond that, so one per project is the point.
- `projects` keeps one environment per provider: moving a project from boat to spaces does not restore boat's snapshot there.
- The agent is told the sandbox starts from "its image, plus whatever the project's environment has installed", since it cannot tell which one it got.
- Not decided here: a Take snapshot button in the Environment card (0197's), an environment for a folder project, and sharing one across projects.

## Addendum: a saved environment the provider no longer has

The provider can lose a saved snapshot while the project's row still says `ready` (it was deleted on the provider's side, 2026-11-17). Creating a sandbox from it then answered 404 and the thread could not start at all. The boat and spaces wakes now create the sandbox from the image when creating from the environment answers "not found" (or, on boat, "expired"), as this decision always said a missing environment would. The journal cleanup of 0330 is skipped for it, since nothing was restored. The row is left as it is: it expires by itself, or is replaced by the next `save_environment`.
