# A long run is told at turn 100 to hand off to a goal

Status: accepted

## Context

A run has 200 turns and is cut off in the middle of its work when it uses them all. The agent cannot see a counter, and the instructions only ask it to judge by feel.

## Decision

When a chat run reaches its 100th turn, the runtime sends one steer message through the backend's existing steering path. It says the notice is automatic, that 100 of 200 turns are used, and that a task still complex should be handed to `define_goal`. The text is `HAND_OFF_NOTICE` in `packages/agents/src/turn-limits.ts`.

## Consequences

- A turn is counted by the native backend's per-model-call `usage` event. The Claude backend reports `usage` once per query, so it is counted by `tool_start` instead: close to a turn, and early when tools run in parallel.
- Works for the native and Claude backends, with no new wire call.
- The count lives in the run's memory, so a run taken up again after a restart or a question counts from zero and can get the notice again.
- Goal sessions are not counted: each starts fresh.
