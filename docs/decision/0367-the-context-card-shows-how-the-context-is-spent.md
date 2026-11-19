# 0367. The context card shows how the context is spent

Status: accepted.

## Context

The Context card showed one number, the tokens in the window, as a ring. It could not say what filled it: a long system prompt, a heavy set of tool definitions and a long conversation look the same, and the only remedy it offered, Compact, only helps with the last.

`@anvia/core` 1.21 estimates how a request spends its input tokens (`estimateContextBreakdown`: instructions, messages, tool results, documents, tools, MCP tools, provider tools and the output schema) and rescales the split to the tokens the provider reported (`scaleContextBreakdown`). It hands the split out on the agent's generation events, which Aven does not see: a durable run's journal carries the request in `model_started` and the response in `model_completed`, and the assistant message's generation metadata has no split.

## Decision

- `ContextUsage` gains an optional `segments` list of `{ id, tokens }`, validated on the wire. It is optional, so `WIRE_VERSION` stays and an older control plane drops the field.
- The runner's event mapper (`durable-events.ts`) keeps the request of a `model_started` event and, on the `model_completed` of the same operation, splits it and scales it to the tokens the bar shows (`context-segments.ts`). It works from the journal, so a replayed run reports the same split. A request it cannot estimate reports no split rather than failing the usage event.
- The card draws the bar as the segments, each sized against the whole window, with a legend of tokens per segment and the free space. A thread with no split, which is every Claude or Codex run and any thread read back from its history, keeps the single filled bar.

## Consequences

- The split is an estimate, proportional to the serialized size of each part, scaled to the provider's count; the total is the provider's, the proportions are not.
- The split lives only on the usage event of the live run. `usageFromHistory` reads a stored message's metadata, which has none, so a reloaded thread shows the plain bar until its next turn. Keeping it means storing it with the thread, which this does not do.
- A tool from an MCP server reaches the agent as an ordinary local tool, so it counts under tool definitions, not under MCP tools.
