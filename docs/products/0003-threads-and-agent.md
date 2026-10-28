# Threads and the coding agent

Status: built. Supersedes `0001-threads-mock-ui.md`. Updated by decision `0005-projects-are-real-threads-belong-to-them.md`: projects are now real and a thread always belongs to one (see `0002` for what changed on the Projects pages).

## What a thread is

A thread is one agent session, stored in `threads`, scoped to an organization and always belonging to a project (`threads.project_id`). Its `project_path` is a snapshot of that project's absolute directory (on the machine running control-plane) taken when the thread was created. The agent's `read`/`write`/`edit` tools are confined to it and its shell starts there. There is no tool approval: the agent acts without asking.

## Flow

1. `/threads`: pick an existing project (or create one), then a prompt. Projects reject relative paths and paths that are not existing directories (422) and store the resolved real path.
2. The thread opens at `/threads/<id>`. The first prompt starts a run on the server.
3. The page attaches to the run over server-sent events: a snapshot of the transcript, then text, tool calls (read, write, edit with a diff, shell, web search) and results as they happen. **Stop** cancels the run.
4. Reloading, closing the tab or opening it elsewhere never stops the agent; reattaching shows the run in progress. Only one run per thread at a time (a second message while running is rejected).
5. Long commands run in the background. When one finishes, its output is delivered to the agent (into the live run, or as a new run), and the thread updates for anyone attached.

## Configuration

`AGENT_PROVIDER` (`anthropic` default, or `openai`), optional `AGENT_MODEL`, and the matching API key. Without a key, sending a message fails with a clear error and nothing is stored.

## Not built

Smart/Rush modes (the toggle was removed), snooze/archive in the UI (the API supports `state`), steering a message into a run in progress, tool approval, a folder browser for the project path, multi-user presence, sandboxing of the shell.

## Security

Any member of an organization can point the agent at any directory the server user can read, and its shell is not confined. Fine for a local, single-user setup; do not deploy with open registration before the shell is sandboxed (see decision 0003).
