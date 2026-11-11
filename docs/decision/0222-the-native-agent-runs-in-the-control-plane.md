# The native agent runs in the control plane, and a machine answers its tools

Status: accepted. Supersedes the part of 0221 that keeps the runner, and with it the agent, on the machine for every provider, and the alternative 0221 rejected. Adds to 0220 and 0219. Nothing here is built yet.

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

- `run.start` and its kin go to the built-in runner for every native run, and name the thread's runtime. The control plane relays the built-in runner's `machine.*` calls to that runtime's runner. A run on the built-in runner's own runtime calls its own host sandbox, as now.
- The journal of every native run is on the control plane's machine (`runs.db` of the built-in runner). A control plane with more than one process would need the journal elsewhere, which is chosen if that happens.
- The control plane carries every workspace's agent loops. They spend their time waiting on the model and on tool calls, but a large installation will see the load move from its runners to its server.
- Each tool call is a round trip from the control plane to the machine. Their results are bounded already (`bounded-result.ts`), and the wire carries them as it carries the files and diff now.
- What acts on a machine outside the tool set moves to calls too: `git_fetch` (`fetch-branch.ts`), preparing a thread's folder (`repo.access`, `git-clone.ts`), uploads written to a thread's folder, a fork's copy of its parent's folder (`fork-workspace.ts`), and MCP servers set to run locally on the machine.
- Secrets stay off the machine's disk as now: a run's variables go with each `exec` call, and the machine's runner keeps them only for the call.
- Bot replies (`bot-replies.ts`) run their agent on the runner too, and move the same way.
- A runner keeps working for an install that does not update its control plane at once: a runner that answers no `machine.*` calls keeps driving its runs itself, until the wire version that drops that is released (`docs/rules/0005-releasing.md`).

## What is not decided yet

- The `machine.*` calls themselves, and the wire version that adds them.
- Whether a thread's run moves to the built-in runner all at once, or per runtime behind a setting while it is proven.
- How the platform shows a tool call that waited for a machine to wake, or failed because it was offline.
