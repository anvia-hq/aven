# Threads and the coding agent

Status: built. Supersedes `0001-threads-mock-ui.md`. Updated by decision `0005-projects-are-real-threads-belong-to-them.md` (projects are real and a thread always belongs to one) and by `0010-projects-run-in-per-thread-sandboxes.md` (a project is a name and a runner; each thread runs in its own sandbox).

## What a thread is

A thread is one agent session, stored in `threads`, scoped to an organization and always belonging to a project (`threads.project_id`). A project is a name and a runner (a computer or VM running `apps/runtime`); the thread records that runner. The first run starts a Docker sandbox for the thread on the runner, with an empty workspace that belongs to the thread; threads do not share files. The agent's `read`/`write`/`edit` tools work on that workspace and its shell and desktop run in the container. There is no tool approval: the agent acts without asking.

## Flow

1. `/threads`: pick an existing project (or create one: a name and one of the organization's runners), then a prompt. A project whose runner is offline cannot start a run and says so.
2. The thread opens at `/threads/<id>`. The first prompt starts a run on the server.
3. The page attaches to the run over server-sent events: a snapshot of the transcript, then text, tool calls (read, write, edit with a diff, shell, web search) and results as they happen. **Stop** cancels the run.
4. Reloading, closing the tab or opening it elsewhere never stops the agent; reattaching shows the run in progress. Only one run per thread at a time (a second message while running is rejected).
5. Long commands run in the background. When one finishes, its output is delivered to the agent (into the live run, or as a new run), and the thread updates for anyone attached.

## Configuration

The model comes from the provider the sender chose, or their default (decision 0006); with none, `AGENT_PROVIDER` (`anthropic` default, or `openai`), optional `AGENT_MODEL`, and the matching API key on the control plane. Without a key, sending a message fails with a clear error and nothing is stored. A runner needs Docker and the sandbox image (`AVEN_SANDBOX_IMAGE`).

## Not built

Smart/Rush modes (the toggle was removed), snooze/archive in the UI (the API supports `state`), steering a message into a run in progress, tool approval, multi-user presence, attaching a GitHub repository to a project (a thread's workspace starts empty), deleting a thread's workspace, restricting a sandbox's network, a viewer for a person to watch the desktop.

## Security

Any member of an organization can run commands in sandboxes on any of its runners. A sandbox contains the thread's workspace and nothing else of the runner's, but its network is open (decision 0009) and the runner owner can reach it through Docker. Do not deploy with open registration unless that is acceptable.
