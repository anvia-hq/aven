# A runner serves folders, and a project is one of them

Status: proposed. Not built. Supersedes 0013 (projects are imported GitHub repositories) once it ships; changes 0044 (the agent acts as the person on GitHub) and the sandbox decisions (0008, 0095, 0211) for the new mode. Nothing is removed by this decision.

## Context

A thread runs in a sandbox, a container or a VM, on a runner, in a workspace the runner cloned from a GitHub repository (0013). The sandbox keeps the agent away from the machine, and it also keeps the agent away from what the person's own machine has: Docker, Compose, their other tools, their running services. A project of Docker-based development cannot be run or checked in it (0217 looked at VMs for this and found each option large).

Amp's runner (`amp --no-tui`, run on a machine) is the other model. It registers the machine with the service, serves the folders it is started in or given, and runs the threads started on the web directly on the machine, with no sandbox. Its isolation is the machine the person chooses to run it on.

## Decision

- **A runner can run threads on its own machine, with no sandbox.** A runner started in this mode (`AVEN_SANDBOX=host` first) runs a thread's commands as the runner's user, in the thread's folder, with the machine's own tools, and Docker works because it is the machine's Docker.
- **A runner serves folders.** The person tells the runner which folders it may work in (`aven runner --dir <path>`, repeatable; the runner's home or working directory when none is given), and the runner tells the control plane, which lists them. A thread can only be started in a served folder, and the runner refuses any path outside them.
- **A project is a runner and a folder.** Creating a project means choosing a runner and one of its served folders (or typing a path under one). The GitHub import is no longer how a project is made; a project that is a git repository still shows its branch and remote, and Ship opens a pull request with whatever `gh` is signed in as on that machine.
- **A thread's folder.** When the project's folder is a git repository, the runner makes a `git worktree` for the thread on its own branch `aven/<first 8 of the thread id>`, so threads on one project do not overwrite each other and the person's checkout is not touched. When it is not a git repository, the thread works in the folder itself, and the runner allows one thread there at a time.
- **No GitHub credentials in Aven for this mode.** The agent uses what the machine is signed in to (`gh`, git's credential helper, ssh keys). The per-person token the control plane hands the runner (0044) is not used in it, and a person with no GitHub login on the machine gets what that machine allows.
- **Project variables still apply**, put in the environment of the commands of that thread only (not the runner's own).
- **The Docker and the Mac VM sandboxes stay** for existing installs and for anyone who wants the isolation; the mode is chosen per runner. Retiring the GitHub import and the container sandbox is a later decision, made once this one has run for a while.

## Consequences

- **There is no boundary between the agent and the machine.** It runs with the runner user's access: their files and ssh keys, every other served folder, the Docker daemon (a member of the `docker` group is effectively root), their network. A prompt injected into something the agent reads can act as that user. This is the same trade Amp makes, and it is acceptable on a machine the person owns and runs the runner on, and not on a shared one. The runner should be run as its own unprivileged user where it can be, and the docs say so and that it is not a sandbox.
- Two threads can collide on a port or a global tool, since they share the machine's network and home.
- The Desktop and Browser panels have nothing to show unless the machine has a display; they are off in this mode at first.
- A thread's secrets (project variables) are in its processes' environment, which other processes of the same user can read.
- A project that is not a GitHub repository has no pull request, branch protection or clone step; Ship says what it cannot do.
- Existing GitHub-imported projects keep working with the sandbox runners; a migration makes the repository columns optional and adds the folder, and no row is deleted.

## Order

1. **Host mode** on the runner: a thread's commands on the machine, in a worktree or folder, with the existing projects and their clone (the runner clones the repository under its home and works there). This is the smallest step and makes Docker-based projects work.
2. **Served folders** on the wire, with the migration, the control plane's list and the platform's "add a project from a runner's folder".
3. Retire the import and the container sandbox, in a decision of their own.

## Not verified

None of it is built. What a runner does for a folder that is a worktree of another, a bare repository or a repository with submodules; how threads started by a bot (0060) pick a folder; how a folder of one runner shows in the platform when the runner is offline; whether the runner's current `git` requirement is enough; and Amp's own behaviour beyond what a person saw in its runner's output (it served `~` and `~/test` and resumed a thread it had served before).
