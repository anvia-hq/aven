# Threads and the coding agent

Status: built. Supersedes `0001-threads-mock-ui.md`; the Projects pages in `0002` are still mock UI and are not connected to threads.

## What a thread is

A thread is one agent session, stored in `threads` and scoped to an organization. Each has a **project path**: an absolute directory on the machine running control-plane. The agent's `read`/`write`/`edit` tools are confined to it and its shell starts there. There is no tool approval: the agent acts without asking.

## Flow

1. `/threads`: type the project path (or pick a recent one), then a prompt. The server rejects relative paths and paths that are not existing directories (422) and stores the resolved real path.
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
