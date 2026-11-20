# Aven Cloud is a sandbox per thread, and a repository is a project

Status: accepted. Superseded in part by 0308 (Aven stops a sandbox when it is idle instead of waiting for boat's auto-stop), by 0328 (the name of the built-in computer), by 0348 (whose limits apply) and by 0392 (expired sandboxes reset to absent for transparent restore). Supersedes the persistent, one-sandbox-per-runtime parts of 0297 and builds the ephemeral model 0221 described. Adds to 0220, 0222, 0229 and 0276. Does not change 0218 (a folder project) or 0252 (a runner clones a repository into a folder). Decided 2026-11-15.

## Context

0297 made a boat.dev sandbox a runtime that a person adds with their own boat API key: one sandbox per runtime, shared by every thread that picks it, with auto-stop off. That is a computer someone keeps, which is what `manual` already is. It does not give what Aven needs: a platform-owned place to run a project's agent that costs nothing to set up, can be thrown away, and is not tied to a person's machine.

What the product wants is what Cursor's cloud agents and Devin do: register a repository once, and every task works in a fresh sandbox, on its own branch, and ends in a pull request. A user's own runner stays the other choice.

Checked against live boat.dev with a trial key (2026-11-15):

- A sandbox is ready the moment it is created, runs commands as `user` in `/home/user`, and has `git`, `gh`, `bun`, `node` and `systemctl`.
- A stop takes about seven seconds and keeps the disk. A resume within ten minutes gives the same machine back. The disk survived (a file written before the stop was read after the resume).
- Boat keeps a stopped disk for at least 14 days and its own cleanup does not delete yet. A shorter life is therefore Aven's job: delete the sandbox (`DELETE /sandboxes/{id}` with `X-Ascii-Confirm-Delete` set to its id).
- A trial account is capped at 2 active sandboxes, 75 creations a day and a two-hour auto-stop. The platform account needs the first payment.
- Not checked: a resume after the ten-minute window, and creating a sandbox from a saved snapshot through the REST call.

How a thread gets its workspace today (`HostSandboxes.#fill`): a project with a `directory` is cloned locally from that folder; otherwise the runner calls `repo.access` and clones `clone_url` with a GitHub App installation token onto `aven/<thread>`. Creating a project only ever sets `directory` (`projects/service.ts`), so the second path is reachable only for old rows. A sandbox that has just been made has no folder, so it needs the second path.

## Decision

- **A thread picks its runtime, in the composer, next to the project.** `threads.runtime_id` is the source of truth. `projects.runtime_id` becomes the default the picker starts on. The picker lists Aven Cloud and every runner of the organization, including the ones that are offline, which are shown and say so.
- **There are two kinds of project.**
  - **A folder project** is as 0218 and 0252 have it: a folder on one runner. The picker offers only that runner for it.
  - **A repository project** is `owner/name`, with `clone_url`, `default_branch` and a GitHub App installation, and no `directory`. It belongs to the organization and to no runtime, so any runtime may run it. Each thread clones it into its own workspace through `repo.access`, on the branch `aven/<thread>`. A repository project requires the GitHub App on the repository; a public repository with no installation is not supported yet.
- **Aven Cloud is a set of built-in, platform-owned, ephemeral runtimes, one per sandbox provider.** `AVEN_CLOUD_PROVIDERS` names the providers to offer, comma separated; a provider also has to have what it needs (boat needs `AVEN_BOAT_API_KEY`). Each enabled provider is a template runtime of its own, with a fixed id, `lifetime = ephemeral` and no user key, so the composer can offer several side by side, each turned off on its own, and named "Aven Cloud" while one is offered and "Aven Cloud · <provider>" when there are more. A provider that is not offered is hidden, refuses new threads and does not wake the computers threads already have, while the expiry sweep still deletes them. A person cannot bring their own account: a user's computer is a runner.
- **A sandbox belongs to one thread, and is a hidden runtime of its own.** Aven Cloud is a template runtime (a fixed id, like the control plane's, shown to every workspace). Starting a thread on it makes a child runtime row (`parent_runtime_id` points at the template) owned by the person, in their workspace, with its own runner token and its own boat sandbox. Child rows are not listed. The hub, the runner token, the wake and the boat client are those of any runtime, so one connection is still one runtime and the hub is not keyed by thread. The sandbox itself is created the first time a tool needs the disk, not when the thread is made.
- **A sandbox is stopped by Aven when it is idle, and the next message resumes it.** 0308 has this: no agent work for five minutes and no person for twenty, with boat's auto-stop kept as a safety net above it.
- **A sandbox lives 48 hours after its thread's last activity.** A sweep in the control plane deletes it then. The thread stays readable; its computer is gone and the platform says so. A repository's branch on GitHub, once pushed, is what lasts.
- **GitHub on a sandbox is in person mode** (0229, 0276): the clone uses the installation token from `repo.access`, and pushes, pull requests and `gh` use the sender's token for that run, held in memory only. Nothing secret is on the sandbox's disk, so a snapshot holds none.
- **Work that is not pushed is lost when the sandbox is deleted.** The platform warns before it, and again when it happens. Pushing a backup branch with an installation token is a later option, because it would put branches the person did not ask for on their repository.
- **Limits are Aven's.** A workspace may hold 20 Aven Cloud computers at once (`AVEN_CLOUD_MAX_SANDBOXES`), checked when a thread is started, so the platform's boat account is not spent by one workspace. A cap on sandbox hours is later work.

## Later, not decided here

- A **per-repository environment snapshot**: an optional setup script runs once, the sandbox is saved as a boat saved snapshot, and new threads start from it instead of installing dependencies each time. It needs the create call to accept a snapshot, which is not yet checked, and it uses the plan's saved-snapshot allowance.
- Project variables and secrets on a sandbox, which follow the existing rule that nothing secret is stored on disk.
- Public repositories with no installation, and bots on Aven Cloud.

## Consequences

- The boat provider of 0297 is reworked: the saved sandbox id moves from the runtime to the thread, the boat API key moves from an encrypted runtime column to the platform's environment, and the "add a boat runtime" dialog goes away. The client, the boot file and command, and the runner-address check stay.
- A repository project and a folder project differ in what the picker allows, so the picker needs the project before it can list runtimes.
- `repo.access` is no longer dormant: it is the clone path for every thread of a repository project, on any runtime.
- A sandbox is stopped after ten minutes of quiet at the earliest. A resume after that is on a new machine, so the runner is started again each time (the wake flow of 0297 already does that), and a process the agent had left running does not come back.
- A trial account cannot carry this in production: it needs the first payment for more than two sandboxes at once.
