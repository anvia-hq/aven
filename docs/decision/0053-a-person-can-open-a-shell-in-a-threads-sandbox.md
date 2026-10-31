# A person can open a shell in a thread's sandbox from a Terminal panel

Status: accepted. Builds on 0010 (a container per thread, freed when idle), 0015 (a runner streams bytes between a sandbox and the browser as binary frames) and 0039 (a person can wake a sandbox).

## Context

The agent works in a thread's container through tools, and a person can watch its desktop (0015) and read its files (0031), but cannot type a command into it. Debugging what the agent did, or running one thing by hand, meant asking the agent.

## Decision

- **A terminal is a shell on a pseudo-terminal, run by the runner that hosts the sandbox.** The runner starts `docker exec -it -w /workspace <container> bash` through Bun's `terminal` option on `Bun.spawn` (`runtime-client/src/terminal-sessions.ts`); `Sandboxes.shell` builds the command and says nothing when the container is not running. Opening a terminal never starts a sandbox, as for the desktop; the panel offers the existing wake-up (0039).
- **The wire grows `terminal.open`, `terminal.resize` and `terminal.close` (control plane to runner) and `terminal.opened` and `terminal.closed` (runner to control plane), wire version 21.** The bytes both ways are binary frames carrying a viewer id, the format of 0015; a runner tells a terminal's id from a desktop viewer's by the sessions it holds. The control plane's `ViewerStreams` keeps desktops and terminals in one table, one limit of 32 per runner, and only accepts `terminal.*` answers for a terminal.
- **`GET /threads/:id/terminal/stream?cols=&rows=` is a WebSocket** for the thread's creator only (403 for other members), checked for origin like the desktop's. A container holds what its last run was given: the sender's GitHub sign-in (0044) and personal variables (0045), which must not reach another member. Keystrokes are binary messages, the shell's output is binary, and a resize is the text message `{"type":"resize","cols":N,"rows":N}`.
- **The shell has what the agent's commands have: the project's environment variables** (0045), named in `docker exec -e NAME` and valued only in the `docker` process's environment, so they are in no command line. The agent's secret-hiding does not apply: a person who opens a terminal can read them, as they can by asking the agent.
- **Limits.** A terminal cannot be paused, so one whose output piles up past 8 MiB on the runner's link is ended with a reason, as a browser that cannot keep up is on the control plane. Keystrokes the terminal has not taken are held up to 1 MiB. An open terminal keeps its sandbox from being freed as idle, like a watched desktop.

## Consequences

- The thread's creator can run commands in its container, as the user the agent runs as, with whatever the last run left there.
- Docker leaves a process running when the client of its `docker exec` is killed, so the runner ends the shell itself: the shell is started as `sh -c 'echo $$ > /tmp/.aven-terminal-<id>; exec bash'`, it is its session's leader, and closing runs `pkill -HUP -s <pid>` in the container, a hangup as closing a terminal sends (a process that ignores it, such as one under `nohup`, lives on). A process the agent started with `start_process` is in another session and is not affected.
- Runners and control planes must be upgraded together (wire version 21).
