# 0135: A thread's agent can fork a thread that starts from its workspace

Status: accepted

## Context

`spawn_agent` (decision 0057) hands short tasks to subagents that work in the parent's own sandbox:
they share its files, its processes and its limits. Some work needs to be apart from that: trying two
approaches at once, a risky change beside a dev server that must keep running, a long task the
parent should not wait on.

## Decision

The agent of a thread can **fork** it: `fork_thread` makes a real thread that starts from a copy of
the parent's workspace, in a sandbox of its own, and works on a task the parent gives it.

- **Only when the person asks.** The agent is told to fork only when the person's own message asks
  for it, and the tool is given to attended runs only (not a goal's sessions, not subagents).
- **A child is a thread.** It belongs to the same project and runner and is the same person's. It
  has its own container, branch `aven/<its id prefix>` and pull requests. It is nested under its
  parent in the sidebar with a Fork badge (`threads.parent_thread_id`).
- **Depth of one, three at a time.** A fork cannot fork, and a parent has at most three forks that
  are not archived.
- **What it inherits:** the parent's working tree as it is, uncommitted changes included, on a new
  branch; the container image the parent keeps, so the child skips the setup; the project's
  variables, the person's GitHub account, skills and MCP servers, as for any run.
- **Not inherited:** the parent's processes and desktop, and its history. The child gets a brief
  written by the parent's agent: the task, and a summary of what it has learned, done and decided.
  The agent knows its own context best, so it writes the summary instead of a second model run, and
  the tool requires it.
- **Same runner.** The workspace is copied on the runner, so the fork runs on the parent's runner. If the
  parent's workspace is gone when the child starts, the child gets a fresh clone and is told to say so in its report.
- **Taking the work back.** The parent's agent reads a fork with `fork_status` (state, last message,
  files changed) and takes its changes with `take_fork_changes`: the runner writes the child's whole
  change (commits and uncommitted work, against the point it forked from) as a patch in the parent's
  workspace, which the agent applies with `git apply` or reads. Nothing is merged for it.

- **Told when a fork ends, only if the parent is working.** The control plane sends the parent a
  `[fork] ...` message (how it ended, never what the fork wrote), which reaches a working agent at its
  next step. An idle parent is left alone: nobody asked it to do anything, and waking an agent
  to act unasked is what this decision avoids. The person tells it to take the fork's work.
- **The fork runs on the person's default model**, as a bot's thread does, not on the parent's choice.

- **The copy is made when the fork's run starts**, a moment after `fork_thread` returns, not at the
  call: changes the parent makes in that moment may be in the copy. The fork's changes are measured
  from the copy, so they are never confused with the parent's.

## Consequences

- A fork costs a container (4 CPUs, 8 GB by default) and a copy of the workspace: `node_modules`
  included, which is why the number is small. A copy-on-write clone is used where the file system has one.
- The tools reach the control plane through a new runtime call, wire version 43.
- Archiving a thread does not archive its forks; a fork keeps working and its link to the parent stays.
