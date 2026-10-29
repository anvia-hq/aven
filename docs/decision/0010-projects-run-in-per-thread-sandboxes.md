# Projects run in per-thread sandboxes on a runner

Status: accepted. Supersedes the host-folder parts of 0005 (a project is a path) and 0009 (sandboxing is an option on a runtime); builds on 0008. The runner-less projects it kept are removed by 0011.

## Context

0005 made a project a directory on a machine; 0008 let that machine be a runtime; 0009 added an optional Docker sandbox around the shell with the project directory mounted in. That treats the machine as the workspace and the sandbox as a wrapper. The intended model is the other way round: a **runner** is a computer or VM that hosts sandboxes, and the sandbox is the workspace.

## Decision

- **A runner** (the runtime of 0008, now always sandboxed) is a computer or VM. It has no project folders. Agents never run commands on its own disk.
- **A project is a name and a runner**, chosen when it is created. It has no path. (A GitHub repository will be attached to it later; creating a project then clones nothing yet.)
- **A sandbox is per thread.** The first run of a thread starts a container from the desktop image on the project's runner, with an **empty workspace** that belongs to that thread. Threads do not share files. Carrying work between threads will be done with git once repositories can be attached.
- **The workspace is a directory the runner manages** (`<runner home>/workspaces/<thread id>`), mounted at `/workspace`. The file tools (`read`, `write`, `edit`) work on it from the runner and stay confined to it; the shell and the desktop run in the container. Nothing on the runner outside that directory is visible to the agent. This keeps the tool set, diffs and projection from 0003 unchanged.
- **The control plane is a runner too.** It starts a built-in runner in its own process (`AVEN_LOCAL_RUNNER`, on by default) that connects to itself like any other runner, with a token that exists only in memory. It is one row (`Control plane`, no organization, no owner) that every organization sees and nobody can revoke or rotate, so a project works with no runner set up. It hosts its sandboxes on the control plane's machine.
- **Every runner, built-in or not, needs Docker and the sandbox image.** An external runner refuses to start without them; the built-in one stays offline and logs why. There is no unsandboxed mode.
- **The folder picker, `project_path`, path validation on a runtime and the `fs.*` calls of the runtime wire are removed.** Threads still record their runner (`threads.runtime_id`), copied from the project when created.

## Consequences

- Existing projects (a path on the control plane or on a runtime) cannot run any more. The rows are kept, without their paths, shown as having no runner, and a thread on one fails with a clear message; recreate them. Their old threads' conversations are kept.
- A thread's files live on the runner under its home directory until something deletes them. Nothing deletes them yet.
- A project cannot move to another runner: its threads' workspaces are on the first.
- Network egress from a sandbox is open (see 0009); restricting it is still future work.
- A runner is the unit of capacity and isolation: more machines, more sandboxes, no change to the control plane.
