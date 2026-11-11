# The agent's tools come from the sandbox

Status: superseded by 0219 (the container sandbox, Desktop, Browser and snapshots are retired). Was: accepted. Supersedes the file-tools-on-the-runner and background-job-notice parts of 0009 and 0010, and the job parts of 0003, 0004, 0006 and 0007.

## Context

0003 gave the agent its own tools (`read`, `write`, `edit`, `shell`, `shell_output`, `shell_kill`) over a `JobRegistry` that ran process groups on the machine. 0009 and 0010 kept those tools and moved only where a command runs: the shell went into a per-thread container while the file tools stayed on the runner, working on the directory the container mounts. That left two views of the workspace, a path-confinement layer to keep the file tools inside it, and a job registry, completion notices and steering that exist only because the shell was ours. `@anvia/sandbox` already offers files, commands and managed processes against exactly the sandbox we hand out (`RemoteSandboxHub.runtime(thread)`).

## Decision

- **The agent's tools are the sandbox's own**, from `createSandboxTools`: `exec_command`, `read_file`, `write_file`, `list_files`, `list_ports`, `start_process`, `list_processes`, `read_process_logs`, `stop_process`, `wait_for_port`, plus the desktop tools. All of them act inside the thread's container, so nothing the agent does touches the runner's disk.
- **`edit` stays ours** (`packages/agents/src/tools/edit.ts`) because the sandbox has no in-place edit. It is built on the sandbox's `readTextFile` and `writeTextFile`, so it too works in the container. `web_search` is unchanged.
- **`createCodingAgent` takes the tools from its host** (`tools`) instead of building file and shell tools from a root directory and a `JobRegistry`. The runner supplies the sandbox's tools.
- **No job notices.** The sandbox has no completion callback, so a process that ends is not reported to the agent: it starts servers with `start_process` and looks with `read_process_logs`, `list_processes` and `wait_for_port`. The wire loses `job.notice`, `jobs.stop` and `run.steer` (version 3), and `RunManager` loses job-driven restarts, `lastSender` and the provider re-resolution they needed. Stopping a run stops the run; a process the agent started keeps running in the sandbox.
- **A sandbox with a running process is not idle.** The runner frees a thread's container after 15 minutes with no run and no running process (`listProcesses`); otherwise it checks again later.
- **Tests use a directory-backed `SandboxRuntime`** (`runtime-client/src/testing/directory-workspaces.ts`) that runs commands in a temporary directory on the test machine, so the same tools run in tests with no container. The container tests stay gated on `AVEN_SANDBOX_TEST_IMAGE`.

## Consequences

- One workspace view and no path confinement code: the container is the boundary.
- `packages/agents` loses `read`, `write`, `shell`, `JobRegistry` and their path and truncation helpers; the UI and projection show the sandbox's tool names (`read_file`, `exec_command`, ...).
- Output limits and truncation are the sandbox's (bounded pages and logs), not ours.
- A finished build or server crash no longer wakes an idle agent. Long work is checked by the agent, within a run.
- Conversations stored before this change contain old tool names (`read`, `shell`); they still render, with the generic label.
