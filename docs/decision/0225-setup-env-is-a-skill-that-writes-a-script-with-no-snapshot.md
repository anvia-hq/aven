# `setup-env` is a skill that writes a script, with no snapshot

Status: accepted. Brings back the `setup-env` skill that 0219 removed with the container sandbox, in a form that needs neither a sandbox nor a snapshot.

## Context

0219 retired the container sandbox and with it the environment snapshots, and `setup-env` went too: it wrote `.aven/setup` and called `save_environment` to keep the result as a snapshot. What was lost with it was not only the snapshot. A thread now works in its own clone on the runner's own computer, so the tracked files are there and everything git ignores (`node_modules`, virtualenvs, build output, `.env`) is not. Every new thread of a project starts without its dependencies, and nothing says what the project needs, which tools, which versions, which services. Finding that out is most of the old skill, and none of it depended on a container.

Two facts about the new place shape what a script can be:

- A command the agent runs is `/bin/bash -c`, with no login shell and no profile, and the environment of the runner's process. The runner's service takes its `PATH` from the shell that ran `aven runner install`. What a profile puts on `PATH` (mise shims, nix, nvm, Homebrew) may not be there.
- It is the person's own computer. A container could be given `sudo` and `apt`; this cannot. A project can also be a folder that is not a git repository, which a thread works in directly.

## Decision

- **`setup-env` is a built-in skill again** (`apps/control-plane/skills/setup-env`). It learns what the repository needs (README, lockfiles, version files, CI, compose), follows the versions the repository names (CI first, then compose, then the README), and never substitutes one silently.
- **It writes `.aven/setup`: a doctor first, an installer second.** One line per check and step, so the agent reads what is wrong. It installs from the lockfile with the frozen flag, is idempotent, starts nothing that keeps running, writes no secrets, and lists the names of project variables still unset without their values. It sets its own `PATH` to the usual user-level tool folders, and is tested under `env -i … PATH=/usr/bin:/bin`, which is what the runner gives it.
- **Nothing is installed system-wide.** No `sudo`, `apt` or `brew install`, and no `curl | sh`. A missing system package or tool is printed as the exact command for the person to run, and the script stops.
- **The toolchain comes from what the project already uses, in this order**: a `flake.nix` (entered with `nix develop -c`), a `devbox.json`, a `.mise.toml` or `.tool-versions` (mise), the machine's own tools with their versions checked, and compose for services. Nix is not required and not suggested when a project has none: it needs root and a daemon to install, an agent writes a flake badly from a README, and a lockfile with a version file covers most projects. When a project names versions and nothing installs them, the skill asks the person whether to use mise, which installs into the home folder with no root, and gives them the command rather than running it.
- **A `Set up` action starts it.** The skill adds `run: bash .aven/setup` to `.aven/actions.yml`, so a person starts it from the thread's Actions button and sees its output under Background tasks. An optional `.aven/stack` starts services and waits for their ports; the dev server is started by the agent as a process, and ports are derived per thread folder so two threads of one project do not collide.
- **Nothing runs it on its own.** There is no runner step, no setting and no instruction added to threads. A repository's script is code from the repository, and it would run on someone's real computer, and in the real folder of a folder project. Running it is something a person presses, or an agent does when the person asks, until there is a reason and a consent for more.

## Consequences

- A new thread of a project still starts without its dependencies until someone runs `Set up`. A project setting that runs `.aven/setup` once in each new clone, off by default, would be a runner step of its own; it is not decided here.
- There is no cache but the machine's: package managers' global stores make a repeated frozen install mostly cache hits, and a fork is copied from its parent and keeps what its parent had.
- `.aven` has to be committed, or other threads of the project do not have the script or the action.
- The skill's script and its `Set up` action are tested where they live: the example action is read by the actions parser, the script is checked with `bash -n` and run under a bare `PATH` (`builtins.test.ts`).
