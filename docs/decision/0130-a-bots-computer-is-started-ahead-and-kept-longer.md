# A bot's computer is started ahead and kept longer

Status: accepted. Adds to 0059 (a bot's reply runs on a runner with a computer of its own) and 0012 (a sandbox is freed when idle).

## Context

A bot's container is started by the first tool that needs it, so a bot that only talks never starts one (0059). A bot that does use its computer then waits for the container, and for its daemon to connect, at the first tool call of a reply after the container was freed.

## Decision

- **Started ahead, in the background.** When a bot's reply begins, and the bot has used its computer before, the runner starts its container without waiting for it: the reply goes on, and the first tool finds the container up or waits for what is left. Which bots have used theirs is a file each in `<home>/bot-computers/`, written when a bot's container first comes up, so it holds across restarts. A bot that has never used its computer, or that only talks, starts nothing.
- **Kept for 30 minutes.** A sandbox with no run and no running process is freed after 30 minutes, not 15 (`idleReleaseMs`), for a thread's as for a bot's.

## Consequences

A bot that works on its computer in the course of a conversation finds it warm. A bot used at least every 30 minutes, or woken by a schedule, keeps its container, and so its memory on the runner (a container may take 8 GB), up all that time; a thread's sandbox and its MCP connections stay as long as well.
