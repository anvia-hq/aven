# Server-owned runs and the SSE protocol

Status: accepted

## Context

Agent runs take minutes, edit files and start background commands. Clients (web now; desktop and mobile later) come and go. An Anvia `AgentStream` cancels its run when it is abandoned, so tying a run to one HTTP response would kill the agent on every reload, and a background job finishing has no request to answer.

## Decision

- **Runs belong to the server.** `RunManager` (`modules/runs/service.ts`) starts a run, consumes its stream itself and fans projected events out to whoever is attached. `POST /threads/:id/messages` returns 202; `GET /threads/:id/events` is server-sent events; `POST /threads/:id/cancel` stops the run.
- **Attach = snapshot, then events.** A client first receives the full transcript (`snapshot`), then `run_start`, `text`, `tool_start`, `tool_end`, `done`, `error`. The transcript is rebuilt with the same pure reducer (`applyEvent`, in `@aven/protocol/events`) on server and client, so a reconnect simply replaces state and cannot duplicate output. Pings every 5s keep the connection under Bun's idle timeout.
- **Only a small projection leaves the server**: text, tool name/target/diff/truncated output, completion, sanitized errors. Turn events (full history, system prompt), reasoning and provider payloads are never forwarded.
- **One run per thread.** A second message while running is rejected (409); steering into a live run is not exposed.
- **Background jobs** are per thread. A finished job is steered into the live run, or starts a new run if it ended. Killed jobs are never reported, **Stop also kills the thread's background jobs** (otherwise a finishing build would resume a run the user stopped), and shutdown kills everything.
- **No approvals.** Tools run without asking; the shell is not sandboxed (decision 0003).
- Running state is derived from the in-memory run map, not stored, so a crash cannot leave a thread stuck "running". Conversations persist through Anvia memory (Postgres) and survive restarts; a run in progress does not.

## Consequences

- Every client speaks the same events; adding desktop or mobile means consuming SSE and applying the reducer.
- A server restart ends in-flight runs (the transcript up to the last saved turn remains).
- Anyone attached to an organization's thread sees its live output.
