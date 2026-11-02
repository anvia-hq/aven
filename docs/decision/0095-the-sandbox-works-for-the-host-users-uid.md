# The sandbox works for the host user's uid

Status: accepted. Builds on 0009 and 0010 (a thread's sandbox is a container with the workspace mounted), 0016 (what limits the container) and 0043 (the setup container is where `sudo` works).

## Context

On Linux a runner starts each thread's container as the host user (`docker run --user <uid>:<gid>`, `hostUser()`), because the workspace is a bind mount that keeps host ownership: files the agent writes must be the host user's, or the runner cannot read, diff, clean up or run git on them. The image, though, was built for `node`, uid 1000: its home, the Python environment and the Rust toolchain belonged to uid 1000 and the home was mode 700.

On a host whose user is not uid 1000 (a homelab at uid 1002), the agent therefore ran as a user the image had never heard of and could not use its own environment: `HOME` was unreadable (`bash: /home/node/.bashrc: Permission denied` on every command), `gh` could not start, `git config --global` and the GitHub sign-in the runner writes had no place to go, `pip install`, `cargo`'s registry and `bun`'s cache failed, the sandbox daemon could not save its state (`EACCES` on `~/.anvia-sandbox`), and Node's `os.userInfo()` threw because the uid had no entry in `/etc/passwd`. It showed only on Linux hosts with another uid (a Mac, and a Linux user at uid 1000, were fine).

The agent is meant to be free inside its sandbox: the container, not file permissions, is what protects the host (0016). Not being able to use its own home is the opposite of that.

## Decision

- **The image's home, Python environment and Rust toolchain are writable by any user** (`chmod -R a+rwX` on `/home/node`, `/opt/venv`, `/usr/local/rustup` and `/usr/local/cargo`, and the home itself is 0777). Nothing is mounted over them, so the container still starts the same on every host, and what the agent installs lives and dies with its container as it always did.
- **An entrypoint gives the user the container runs as a name.** `/etc/passwd` and `/etc/group` are writable by any user, and `aven-entrypoint` adds an entry (`aven`, home `/home/node`) for a uid that has none before it runs the command. The entrypoint replaces the empty one (`ENTRYPOINT []`), which only kept the base image's own services from starting; it execs whatever command it is given, so the daemon, the setup container's `sleep infinity` and anything run with `docker run <image> <command>` start as before. `docker exec` does not go through it.
- **The setup container opens up what it wrote** (0043). It runs as `node`, so what `.aven/setup` wrote into the home and the toolchain folders would be `node`'s alone in the snapshot; before the commit the runner, which already hands the workspace to the host user, makes the entries of those four folders that are not writable by any user so again. It does that with `find ... ! -perm -o=rw -exec chmod`, not `chmod -R`: on the image as it is nothing needs changing, but `chmod -R` touches every file, each is copied into the container's layer, and the snapshot would grow by about 900 MB.
- **Otherwise the runner does not change.** It still starts the container as the host user, and the user is still not root, still has no `sudo` in thread containers and still runs with `no-new-privileges` (0016, 0043). Who can do what to the host did not change; only the agent's own files became its own.
- **A test starts the image as a user it does not know** (`packages/runtime-client/src/sandbox.test.ts`, with the other tests that need Docker): it has a name, can write its home, the daemon's state folder, the Python and Rust trees and git's settings, and `gh` starts.

- **A thread's old environment is repaired when its container starts.** A thread keeps the image it started from (0043), so an environment saved from a sandbox image before this decision keeps the old home however the image is updated: in practice a thread that already ran `.aven/setup` on a Linux runner at another uid went on without `gh` or git settings (and its agent asked for a GitHub token to push with). When the container runs as the host user, the runner runs a repair in it as root (`container-home.ts`, `docker exec -u 0`): it stops at once on an image that has the fix (0.04 s), and otherwise opens the home and toolchain entries that are not writable and adds the uid to `/etc/passwd` (0.2 s, and the container's layer grows by about 900 MB until it is released). Saving the environment again (`/setup-env`) makes one from the current image, which does not need it.

## Consequences

- The fix is in the sandbox image and in the runner, so a runner has it after `aven update`. A new thread's container is made from the new image; a setup snapshot (0043) made from the old image is not used again once the image changes, so the next thread runs the setup again; and a thread that already has an environment is repaired at its next container start (above).
- Any user in the container can edit `/etc/passwd`. The container has one user, who cannot gain privileges (`no-new-privileges`, no setuid use, not root), so an entry for uid 0 would not make anyone root.
- Files the agent writes outside the workspace belong to the host's uid inside the container, not to `node`, which has no bearing on anything outside it.
