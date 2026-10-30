# Runs go through @anvia/durable on the runner

Status: accepted. Replaces the conversation-memory part of [0008](0008-control-plane-runtimes-and-clients.md) (the runner no longer loads or appends history through the control plane) and the way [0020](0020-the-agent-can-ask-the-user.md) keeps a question (the run stays parked in the runner's journal; the wire is unchanged).

## Context

A run was `agent.stream()` in the runner's process. A restart, a crash or a dropped link lost its progress, and long work (many edit-and-verify cycles) had no way to outlive one process. `@anvia/durable` journals a run (submission, model responses, tool results, progress events) and continues it from the committed results. Its journal is SQLite on one host with one owner, which is what a runner is: a process on a machine with a disk.

Durable shapes the design:

- An agent registered with durable cannot have a `memory` store. Durable keeps each session's conversation itself, so the model's history is the journal's.
- Agents are registered by id and cannot be replaced or unregistered while their run is unfinished, and that includes a run parked on a question.
- Recovery replays committed results. A tool call in flight when the process stopped follows the tool's recovery policy.

## Decision

- **The runner owns a `DurableRuntime`** (`runtime-client/src/durable-runs.ts`) on `<AVEN_RUNTIME_HOME>/runs.db` (`journalPath`, required by `startRuntime`). One process may use it; the control plane's built-in runner uses the same file in dev. `createCodingAgent` takes an `id` (one agent per run, `run-<runId>`) and returns its `compaction`; the runner registers both, with `stream: true` and durable's `modelRetry` (5 attempts, 1 s doubling to 30 s) in place of the agent's own retries. Durable's compaction replaces the memory store's.
- **The history is durable's, the transcript is the control plane's.** When a run ends or stops on a question, the runner sends the messages that execution produced with `memory.append` (the control plane's Postgres store, scoped by its own record of the run). The control plane still builds snapshots and usage from that store, so `RunManager`, the SSE stream and the platform are unchanged. `memory.load`, `memory.snapshot` and `memory.replacePrefix` are no longer used by the runner (the wire still accepts them; remove them with the next wire version).
- **Events** come from the journal (`durable-events.ts`): model deltas, tool results and usage map back to the same `RunEvent`s the agent's stream projected. The context window comes from the run's model, since durable does not report it.
- **A question parks the run.** The wire is as in 0020 (`run.end` with `interaction` and its `continuation`, then `run.resume`), but the run stays in the journal and `run.resume` delivers the answer to it (`run.respond`). Two things would go stale while a person thinks, and are handled:
  - The agent's tools point at the sandbox of the run that asked, which idle release may have freed. They are stand-ins (`late-bound-tools.ts`) that call the thread's current sandbox.
  - Its model client holds a gateway token, revoked when the run paused. The gateway token is now derived from the thread (HMAC of `PROVIDER_ENCRYPTION_KEY`, else `BETTER_AUTH_SECRET`), so the run that answers gets the same token. The grant still exists only while a run holds it. The provider cannot change between question and answer (the token's path names it); model and effort can, since the gateway pins them per request.
- **After a runner restart**, a parked question can still be answered: the agent is built again under its old id and registered. A run that was working is cancelled when the journal opens unless a record asks for it (decision 0024), because an unfinished run nobody follows would hold its thread's queue.

## Consequences

- A replaced or lost runner loses its threads' model history (the transcript people read stays in Postgres). Before this the conversation was the control plane's, so any runner could continue any thread.
- A run's partial turns are not in the transcript when it fails or is cancelled: only completed outcomes are sent. Before, turns were saved as they finished.
- A model request that is retried can repeat streamed text in the client; the protocol has no event for "discard this attempt" yet.
- Anthropic thinking blocks now come back from durable's history on later runs; `withoutStoredReasoning` no longer applies (bug 0001). Unverified against the live API.
- Continuing interrupted runs came with decisions 0023 and 0024.
- The wire's `memory.load`, `memory.snapshot` and `memory.replacePrefix`, and the agent's `memory` option with `withoutStoredReasoning`, are unused by production runs. Remove them with the next wire version.
