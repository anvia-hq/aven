# Agent engine: tools and background jobs

Status: accepted; the tools and the job registry are superseded by 0012 (the agent's tools come from the sandbox).

## Context

`packages/agents` is the agent engine, built on Anvia (`@anvia/core`, `@anvia/openai`, `@anvia/anthropic`). Agents need file tools and a shell, and long commands (dev servers, builds) must be able to run without blocking the run.

## Decision

- **Tools follow opencode's semantics** (numbered `read` with paging, exact-match `edit`, `write` that creates parents, `shell` with `background`), reimplemented as plain `createTool` factories that take `{ root }`. No Effect runtime.
- **Direct `Bun.spawn`, not bun-pty.** Pipes with stdout and stderr merged, no new native dependency. Bun's `terminal` spawn option is available if interactive PTY support is needed later.
- **`JobRegistry` owns processes.** Each job is its own process group (`detached`), so timeouts, aborts and `shell_kill` also kill children such as `bun run dev` workers. Foreground calls wait (2 min default timeout) and are killed if the tool call is aborted. Background calls return a `jobId` immediately and outlive the call; `disposeAll()` stops everything on host shutdown.
- **Completion is delivered by the host, not the tool.** A tool call cannot push into a running turn. `jobs.onComplete` fires when a job exits; the host sends `formatJobNotice(job)` with `stream.steer()` (applied at the next turn boundary) while the run is live, or starts a new run if it ended. `shell_output` only inspects a running job; tool descriptions tell the model not to poll.
- **File tools are confined to `root`** (symlinks resolved). **The shell is not**: it runs as the server's user in any directory it can reach. Real isolation (`@anvia/sandbox`, containers, per-thread worktrees) is a separate decision and must be made before running agents on untrusted prompts. (Decision 0009 adds an opt-in container sandbox for runtimes.)

## Consequences

- Output returned to the model is capped at the last 30k characters; the registry keeps up to 2M characters per job and the last 50 finished jobs.
- Background-completion wiring (steering, resuming ended runs) belongs to the control-plane run loop that does not exist yet.
