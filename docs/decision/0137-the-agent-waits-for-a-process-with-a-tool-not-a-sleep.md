# 0137: The agent waits for a background process with a tool, not a sleep

Status: accepted. Builds on 0012 (the sandbox's tools) and 0071 (background tasks).

## Context

An agent that starts a build, a test run or a server in the background has no way to wait for it. The sandbox's process tools list, read and stop a process; `wait_for_port` waits for a server. Nothing waits for a process to end, and the instructions said "nothing tells you when a process ends: look when it matters". So the agent ran `sleep 240 && tail log` in a foreground command, which the person sees as one command that seems to hang for minutes, and which holds a command's whole timeout whatever the process does.

## Decision

- **`wait_for_process { processId, timeoutSeconds?, until? }`** (`packages/agents/src/tools/wait-for-process.ts`, made in `runtime-client/src/thread-tools.ts` over the sandbox's own process calls). It returns when the first of these happens: the process has ended, its output contains the `until` text, or the time is up (60 seconds unless given, at most 240). It always gives the end of what the process printed on each stream (8 KiB), the exit code if it ended, how long it waited, and a one-line summary. A process that is still running is waited for again with another call.
- **`until` is plain text**, not a pattern, so a model cannot hand the runner an expression that runs for long.
- **The thread shows it as its own row**, "Waiting for <process id>", with the summary when it ends, not as a command and not as a sleep. It is cut short when the run is cancelled.
- **The instructions say to use it and never to `sleep` in a command.** That is a prompt, not a block: a command that sleeps still runs.
- It is in the sandbox's tools, so a bot's computer and a general subagent have it too; an explorer, which only reads, does not.

## Consequences

- The wait polls the sandbox once a second; the output is read only while there is an `until` to look for, and at the end.
- A wait is one tool call that can take four minutes, which the run holds as it held a long command.
