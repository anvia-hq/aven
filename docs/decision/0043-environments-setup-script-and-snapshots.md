# A repository sets up its environment once, and threads start from a snapshot

Status: accepted. Builds on 0010 (a container per thread, the workspace mounted at `/workspace`), 0013 (the clone) and 0035 (`.aven/skills`). Follows Amp's orbs: a setup script in the repository and a snapshot of what it made.

## Context

Every thread starts from the bare sandbox image and a fresh clone, so each one installs the project's dependencies again, and a repository that needs system packages or a toolchain the image lacks cannot be worked on at all. Amp solves this with `.agents/setup`, run once, and a project snapshot that later threads start from, while the repository is still cloned or updated per thread.

## Decision

- **A repository can carry `.aven/setup`** (an executable shell script at its root) and optionally **`.aven/resume`**. `.aven/ship.md` follows with shipping (a later decision). Aven reads them from the thread's workspace; nothing is uploaded or copied elsewhere.
- **`.aven/setup` installs what every thread needs**: dependencies, tools, a built project. It should be idempotent and must not leave long-running processes: they are stopped when it ends. It runs in a **setup container**: the sandbox image, user `node` with `sudo`, network, the workspace mounted at `/workspace`, and **without `no-new-privileges`**, so it can install system packages. Thread containers keep `no-new-privileges` and cannot use `sudo`. It is stopped after 20 minutes. Its output is kept beside the snapshot, as `<key>.setup.log`, so a setup that failed still has one.
- **A snapshot is two things, kept per organization and repository on a runner**: a Docker image made with `docker commit` of the setup container (system packages, global tools, caches), and a copy of the workspace as setup left it (`node_modules`, build output). They live in `<AVEN_RUNTIME_HOME>/snapshots/<key>/` (`meta.json` and `workspace/`; a folder without `meta.json` is not a snapshot) and the image is tagged `aven-env-<key>`; the key is the SHA-256 of the organization id and the clone URL. A setup that fails or times out makes no snapshot.
- **A new thread restores it when there is one**: its workspace is a copy of the snapshot's (a copy-on-write clone where the file system has them), brought up to date with the repository (fetch the default branch with the run's read-only token, reset to it, and the thread's own branch on top; untracked files stay), and its container starts from the snapshot's image. Setup is skipped.
- **A snapshot is valid for 72 hours and while the sandbox image it was made from is unchanged**; then the next thread that needs one runs setup again. Editing `.aven/setup` does not invalidate it by itself; deleting the folder does.
- **Who runs setup**: the first thread on a repository with `.aven/setup` and no valid snapshot runs it before its container starts (the run waits for it); the agent can also ask for it with a tool, `save_environment`, once it has written or changed the script, which is what the built-in `/setup-env` skill ends with. The tool runs the script again in a fresh setup container, so a snapshot is always what the script makes and never what one container happened to accumulate.
- **`.aven/resume`** runs in a thread's container each time it starts, once its daemon is up, and the run waits for it up to 10 seconds (it is for a quick login or repair, not an install).
- **The sandbox image gains `sudo`** for `node` (it needs a rebuild: `docker build -t aven-sandbox-desktop:dev apps/runtime/sandbox-image`). It does nothing in thread containers.

## Consequences

- A setup script is code from the repository run with `sudo` in a container that has network: it is trusted as the repository and the agent are, and the container, not the host, is what limits it (gVisor, 0016, applies).
- The first thread on a repository waits for setup (up to 20 minutes); the next ones do not.
- A snapshot holds a copy of the repository, so it is disk the runner keeps per repository; nothing deletes it but its age.
- The snapshot belongs to one runner: another runner for the same repository makes its own.
- Nothing changes on the wire: setup, snapshots and resume are all the runner's own.
