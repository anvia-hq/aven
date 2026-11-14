# 0296: `@anvia/durable` 0.17 has `toolConcurrency`, so the patch is gone

Date: 2026-11-15

Supersedes 0070.

## Decision

- All `@anvia/*` packages are at their latest versions (`@anvia/core` 1.19, `@anvia/durable` 0.17 and so on). The local patch of `@anvia/durable` and the `patchedDependencies` entry are removed; `DurableAgentRegistration.toolConcurrency` is upstream. Our registration still sets 4 and a probe at open still fails loudly if an installed `@anvia/durable` ignores it.
- Tools are defined with `handler` in `createTool()`; `execute` is deprecated upstream with the same signature.

## Consequences

- Anvia now keeps tool calls in order only for a turn that calls a question tool or a tool that may need approval, not for every run of an agent that merely has one. A thread's run with `ask_user` available runs the other tools of a turn side by side (up to 4), where it ran them one at a time before. Two `edit` calls on one file in a single turn could overwrite each other; as before, tools of a turn share one sandbox.
- `unregisterAgent` is asynchronous: `DurableRuns` waits for it, so a goal's agent id is free when its goal ends.
- `events()` of the runtime is asynchronous: replaying a run's earlier events happens inside the follow, before its stream.
- A goal's next session header is written only after the previous session's events are, which the faster stream could otherwise reorder.
