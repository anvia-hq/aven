# The runtime containers run under is configurable, for gVisor

Status: superseded by 0219 (the container sandbox, Desktop, Browser and snapshots are retired). Was: accepted. Adds to 0010; containers still start the same way.

## Context

Each thread's container runs agent-written code. Under Docker's default runtime (`runc`) it shares the host's kernel, so the limits we set (memory, CPUs, pids, `no-new-privileges`) do not stop a kernel exploit. gVisor (`runsc`) puts a user-space kernel between the container and the host. `@anvia/sandbox` supports a runtime for the containers it creates itself, but we start our own containers (`dockerRunArgs`), so it never applied to us.

## Decision

- **`AVEN_SANDBOX_RUNTIME`** (runner and the control plane's built-in runner) is passed to `docker run --runtime`. Empty keeps the daemon's default, so nothing changes unless it is set.
- **It is checked at start.** The name must look like a runtime name (no flags), and `docker info` must list it; otherwise the runner refuses to start and says to install `runsc` and run `runsc install`.
- **It is off by default.** Docker Desktop and OrbStack on macOS have no `runsc`. It is for Linux runners.

## Consequences

- Not tested here: whether Plasma, Chrome and Xvnc run under gVisor (software rendering, shared memory and `/dev/shm` are the likely trouble). Try it on a Linux host before relying on it.
- gVisor is slower on syscall-heavy work such as installs and builds.
