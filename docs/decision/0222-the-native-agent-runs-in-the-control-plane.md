# The native agent runs in the control plane, and a machine answers its tools

Status: accepted. Supersedes the part of 0221 that keeps the runner, and with it the agent, on the machine for every provider, and the alternative 0221 rejected. Adds to 0220 and 0219. Built for every runtime, with no setting: see "What is built".

## Context

A thread's agent runs on its runtime's runner today, so a runtime that is offline refuses every message ("The runtime for this project is offline"), even one the agent could answer without the machine. Under 0221 an ephemeral machine would have to stay awake for the whole of a run, through every model call, though it is only needed while a tool acts on it.

0221 rejected moving the agent to the control plane because it took the cost to be a second version of every way Aven touches a machine, over each provider's API. That was too high an estimate:

- **Every tool the agent uses on a machine goes through one interface.** `exec_command`, `read_file`, `write_file`, `list_files`, the process and port tools, `edit`, `view_image` and `show_artifact` are built on a `SandboxRuntime` per thread (`thread-tools.ts`), which `ThreadWorkspaces.acquire` gives a run, and which can already be started lazily, when a tool first needs it.
- **What the platform reads from a machine already goes over the wire.** The diff, files, search, processes, artifacts, the terminal and the computer's state are calls from the control plane to the runner (`diff.get`, `files.read`, `processes.list`, `terminal.open`, `computer.status`, and others). They stay as they are.

So a machine keeps a runner that answers calls, and the agent moves.

## Decision

- **The native agent runs in the control plane's built-in runner** (`runtimes/local.ts`, 0010). It keeps everything it has now: `@anvia/durable` and its journal, steering, questions, goals, compaction, subagents, memory, cockpit, forks, and the MCP servers a person added.
- **A thread's machine is reached through its runner, as a tool server.** The runner on the machine answers a set of `machine.*` calls (exec, read, write and list files, start, list, stop and read processes, ports) with the host `SandboxRuntime` it has today. In the built-in runner, a thread's `ThreadWorkspaces` gives a `SandboxRuntime` that sends each call through the control plane to the thread's runtime, reached with `reachRunner` (0220, 0221). One adapter serves every provider, since every machine runs `aven runner`.
- **The machine is needed only while a tool acts on it.** A run starts with no machine. The first tool that needs one reaches it, which wakes an ephemeral machine. A machine that cannot be reached, such as a VM that is switched off, fails that tool call with a message the agent reads ("the computer is offline"), and the agent goes on: it can answer, ask, remember and use its other tools.
- **An ephemeral machine sleeps between tool calls** after its provider's idle time, unless a process the agent started or an open terminal holds it. It no longer stays awake for model calls. Since the journal is in the control plane, a machine that stops mid-run loses only what was running on it.
- **What 0221 decided about machines stands.** A persistent runtime is one machine for many threads, an ephemeral one is a machine per thread made from the runtime, a fork's machine is made from a snapshot of its parent's, and reading a thread does not wake its machine.
- **The SDK backends run on the machine.** The Claude Agent SDK and Codex run their own tools in their own process, so they run beside the runner as 0220 says, and a run of theirs needs the machine for its whole length. Only the native agent moves.

## Consequences

- `run.start` and its kin go to the built-in runner for every native run of a runtime set so, and name the thread's runtime. The control plane relays the built-in runner's `machine.*` calls to that runtime's runner. A run on the built-in runner's own runtime calls its own host sandbox, as now.
- The journal of every native run is on the control plane's machine (`runs.db` of the built-in runner). A control plane with more than one process would need the journal elsewhere, which is chosen if that happens.
- The control plane carries every workspace's agent loops. They spend their time waiting on the model and on tool calls, but a large installation will see the load move from its runners to its server.
- Each tool call is a round trip from the control plane to the machine. Their results are bounded already (`bounded-result.ts`), and the wire carries them as it carries the files and diff now.
- What acts on a machine outside the tool set moves to calls too: `git_fetch` (`fetch-branch.ts`), preparing a thread's folder (`repo.access`, `git-clone.ts`), uploads written to a thread's folder, the mark a turn starts from (`markTurn`), and a fork's copy of its parent's folder (`fork-workspace.ts`).
- An MCP server is reached from where the agent runs. A run on the control plane reaches none at a private or local address (`allowLocal` is off for it), or it could reach the control plane's own network.
- Secrets stay off the machine's disk as now: a run's variables go with each command, merged where the agent runs (`withProjectEnv`), and the machine's runner keeps them in memory only, for its Terminal.
- Bot replies (`bot-replies.ts`) run their agent on the runner too, and would move the same way; they have not yet (see "What is not done yet").
- It is not opt-in: every native run moves at once, since Aven has no installs to keep as they were. A runner from before this answers no `machine.*` calls, so its tools fail until it is updated (`aven update`).

## What is built

- **The machine side.** A runner answers `machine.call` for a thread with its `HostSandboxes` (`machine-calls.ts`): `prepare` (clone or link the thread's folder; repository access is sent only when the project has no folder), the `SandboxRuntime` operations, uploads, images, skills (it asks for the archives it lacks), `git.fetch` and `turn.mark`. A process the agent starts there is one the platform lists and stops on that runner, and the runner frees the thread's computer when it is idle as for its own runs.
- **The relay.** A run whose thread names a machine (`RunThreadInfo.machine`) may send `machine.call`; the control plane reaches that runtime for the run's own thread (`hub.machines`, `reachRunner`) and passes the call on, with the command's own time limit and a margin (`runtime-calls.ts`). A run that names none, an unknown operation or an offline machine is refused.
- **The agent side.** On a runner, `PlacedWorkspaces` sends a thread whose run names a machine to `RemoteWorkspaces` (`remote-workspaces.ts`, `remote-sandbox.ts`), and every other thread to the runner's own. The thread's folder is prepared on the first tool that needs it. A folder project is prepared from `repo.folder` alone, so a git command there is an ordinary shell command; `repo.access` is only the clone of a repository that has no folder. A machine call is never sent again after a reconnect, since running a command twice is worse than failing it (`control-plane-calls.ts`).
- **Where a run goes.** Every native run goes to the built-in runner and is cancelled there (`RemoteRuntime`), naming its thread's runtime as its machine, unless the thread is on the built-in runner's own runtime, which runs it with its own computer. A control plane with no built-in runner (`AVEN_LOCAL_RUNNER=off`, "only the runners you attach") has nowhere to run an agent, so there every run stays on its thread's runner as before (`composition.ts`). A setting per runtime that kept the agent on the machine by default was built first and taken out before release, so there is no `agent_host`.
- **Forks.** A fork is a thread on its parent's runtime, so its run names the same machine, and `prepare` sends `forkOf`: the machine copies the parent's folder on its own disk as before (`fork-workspace.ts`). Taking a fork's changes is the `fork.take` call, which writes the patch on the machine (`take-fork.ts`).
- **Attached files.** An image a person attaches is kept on the agent's side too, so the model sees it whether or not the machine can be reached. A file that cannot be written to the machine when the run starts waits with the built-in runner under a name of its own (`notes-1a2b.txt`). No folder is guessed for it. When the machine writes the file, it lands in that machine's uploads folder, and that path is what the agent is told: in the prompt when the folder is known by then, and otherwise with the tool call that wrote the file (`remote-workspaces.ts`, `UploadStore.put`).
- **An offline machine.** The run starts, with no skills from the machine, and a tool that cannot reach the machine fails alone with "The computer is offline" (`run-driver.ts`'s `wake`). `remote-machine.test.ts` runs this end to end with the built-in runner and a second runner as the machine.

## What is not done yet

- A process the agent left running on the machine does not wake the thread when it ends (0144): the machine's runner watches only the processes of its own runs.
- Cancelling a run does not stop a command that is running on the machine; it runs to its time limit.
- Bot replies still run on the bot's runner.
- A runner from before this answers `machine.call` with "Unknown call", which the agent reads as its tool failing; the platform does not yet say that the machine's runner needs updating.
- The platform does not show a tool call that failed because the machine was offline apart from the tool's own error.
- A fork on a machine is tested by its parts (`remote-workspaces.test.ts`), not end to end through an agent that forks and takes the changes.
- The Playwright suite runs with `AVEN_LOCAL_RUNNER=off`, so its runs stay on their runner's own agent and none of it covers an agent on the control plane; only `remote-machine.test.ts` does.
