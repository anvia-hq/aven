# Sandboxed runtimes: Anvia sandbox with a desktop image

Status: accepted and built (opt-in per runtime). Resolves the "real isolation" question left open by 0003 and narrows the risk named in 0008.

## Context

The agent's shell was never confined (0003), and 0008 made runtimes shared with the whole organization: any member can run commands as the runtime owner's OS user. That is an accepted trade-off for a trusted team, but it should not be the only option.

## Decision

- **A runtime can run every command in a Docker container** from a desktop image, using `@anvia/sandbox`. Set `AVEN_SANDBOX_IMAGE` on the runtime (build the image from `apps/runtime/sandbox-image`, a vendored copy of the package's reference desktop image pinned to `@anvia/sandbox@1.3.2`). Without it, commands run on the machine as before, and the runtime says so at startup. Sandboxing is per runtime, so a team can have an isolated shared runtime and a personal unconfined one.
- **One container per thread**, started on its first run and removed when the runtime stops (and any left behind by a crash are removed at the next start). The project directory is bind-mounted at `/workspace`, so the file tools (`read`, `write`, `edit`, still confined to the project root on the host) and the shell (in the container) see the same files, nothing is copied back and forth, and the existing diff and tool projection are unchanged.
- **The seam is `JobRegistry`'s launcher.** Shell, background jobs, kill, timeouts and the completion notices that steer the agent are the existing code; only how a command is started differs (`hostLauncher` or the sandbox's exec stream). Killing a job aborts the exec in the daemon.
- **The sandbox hub lives in the runtime process**, not the control plane. The daemon in the container dials out to it on a random port with a per-container token; the control plane never sees sandboxes. The hub listens on all interfaces because the container reaches it through the host gateway; the token is the only gate, and the daemon strips it (and the hub URL) from the environment of the commands it runs.
- **The agent gets desktop tools** (`desktop_screenshot`, click, type, key, scroll, and so on) from the same container. Their images are not sent to the web client (a tool result shows `[file]`); the model sees them.
- **Limits per container:** 2 GB memory, 2 CPUs, 512 processes, `no-new-privileges` (`AVEN_SANDBOX_MEMORY_MB`, `AVEN_SANDBOX_CPUS`). On Linux the container runs as the host user so files keep their owner.

## Consequences

- Commands cannot see the host's files, processes or other users' home directories, only the project directory. They can still change that directory, and anything under it, including `.git`.
- **Network egress is open.** The daemon needs the network to reach the hub, so `network: none` is not possible here. Restricting egress needs an internal network plus a proxy, and is not done.
- A runtime with a sandbox needs Docker and the image on its machine. A run on a thread whose container cannot start ends with an error saying so.
- Background commands live in the container, which outlives a run but not the runtime; restarting the runtime ends them, as it did before.
- The desktop starts on first use. A viewer for a person to watch or take over is not wired (the hub supports it); only the agent drives it for now.
- The control plane's built-in runtime is not sandboxed. Use a runtime with `AVEN_SANDBOX_IMAGE` for anything shared.
- Tests: the launcher seam is unit tested; the container behavior (commands, mount, environment, kill) is tested against real Docker when `AVEN_SANDBOX_TEST_IMAGE` is set.
