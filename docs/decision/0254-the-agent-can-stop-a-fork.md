# 0254: The agent can stop a fork

Status: accepted. Adds to 0135 (a thread can fork itself) and 0143 (waiting for forks).

## Context

An agent could start a fork, look at it and take what it changed, but nothing stopped one. Asked to stop a fork that was still working, it could only tell the person to archive it from the sidebar.

## Decision

- **`stop_fork` (both backends)** cancels a fork's current run, as the person's Stop button does. It is one of the fork tools (`packages/agents/src/tools/forks.ts`), so the native agent and the Claude agent (through its MCP server's catalog) both have it. The fork stays a thread under its parent, what it did stays in its folder (`take_fork_changes` still reads it), and it can be given a new message later. It does not archive it.
- **It is the existing `fork.status` call with an optional `stop`**, not a new call: no wire version changes, and a control plane that has not updated ignores `stop` and answers with the status, so the tool says the fork could not be stopped instead of failing. The reply says `stopped: true` when a run was cancelled and `running: false` at once.
- **Only the parent's own forks**, by the check `fork.status` already makes. The cancelled fork does not send its parent a `[fork]` note (decision 0142 ignores a cancelled end).
- The fork instructions tell the agent to use it when the user asks to stop a fork.

## Consequences

- A fork that is not working answers `The fork was not working, so nothing was stopped.`
- A stop reaches the run wherever it runs (the control plane cancels the run's handle), whichever runner the fork is on.
