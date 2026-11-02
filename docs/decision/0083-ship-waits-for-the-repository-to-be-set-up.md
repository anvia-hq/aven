# Ship waits for the repository to be set up

Status: accepted. Builds on 0041, 0044 and 0069 (the Ship button), 0043 (the environment's setup script) and the built-in skills `setup-env` and `setup-ship` (0035). It narrows 0044: Ship had a default prompt for a repository with no `.aven/ship.md`, and now the button is not offered until the repository has one.

## Context

Ship sends the agent a prompt; without the repository's own `.aven/ship.md` it was Aven's default (commit, rebase, check, push, a draft pull request). The two built-in skills exist so a repository says how it is set up (`/setup-env` writes `.aven/setup` and saves a snapshot) and how it ships (`/setup-ship` writes `.aven/ship.md`), but nothing asked for them: a person could ship with the default before either was done. The person asked that Ship be available only once both skills have been run.

## Decision

- **The repository is set up to ship when its thread's workspace has both files**: `.aven/setup`, which `/setup-env` writes, and `.aven/ship.md`, which `/setup-ship` writes. `GET /threads/:id/ship` answers `{ ready, setup, ship }`, found by asking the thread's runner for each file (`files.read`, as the ship prompt already does for `.aven/ship.md`); the thread must be one of the organization's. A workspace that does not exist yet has neither.
- **It is the thread's own workspace that is read**, so the thread in which the skills were run can ship the files it wrote, which is how they reach the repository. Another thread has them once they are in the repository (a new thread starts from a clean checkout, 0072).
- **The Ship button is shown but off until then**, with a tooltip that names what is missing (`/setup-env`, `/setup-ship`, or both) and says to run it in the thread. It asks again when a run starts or ends, which is when the agent writes the files. If the runner cannot say (offline), the button is off and the tooltip says it could not check. While the answer is on its way the button is off with no tooltip. The pull request link and the connect-GitHub button are unchanged.
- **Only the button waits.** `POST /threads/:id/ship` does not check, and still falls back to the default prompt for a repository with no `.aven/ship.md`; nothing but the button sends it.

## Consequences

- The default ship prompt is no longer reachable from the app (a repository must have `.aven/ship.md` to ship at all); it remains for the API.
- Setting up is done in one thread: run both skills there, then ship, and the pull request carries the two files. Running `/setup-env` in one thread and `/setup-ship` in another leaves both off until the first is merged.
- A thread that already has a pull request from before this cannot update it until the repository is set up.
- The check is that the files exist, not that `.aven/setup` is executable or that a snapshot has been saved.
