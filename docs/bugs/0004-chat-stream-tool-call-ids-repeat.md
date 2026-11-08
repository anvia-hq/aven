# Streamed chat completions name tool calls by position, so ids repeat from one reply to the next

Status: worked around by `withUniqueToolCallIds`; found on 2026-11-01 with `@anvia/openai` 1.3.6 behind a LiteLLM gateway (`openai` kind, a model that answers on chat completions).

## Symptom

A thread's conversation shows the first few tool calls of a run and none after them, while the text the agent wrote between the later calls runs together without a space (`…Debian trixie.Now checking…`). The run itself is fine: its journal holds every call, over 20 steps, and the agent keeps working. Reloading the page does not bring the calls back.

## Cause

The chat completions adapter (`@anvia/openai`, `dist/index.js`, the streamed `delta.tool_calls` branch) gives each streamed tool call the id `tool_<index>`, its position in that reply, and keeps the provider's id only as `callId`. Every reply starts at `tool_0`, so over a run the ids repeat. Three things told calls apart by that id:

- `createDurableEventMapper` announced each id once for the whole run (`announced`), so a call whose id had been seen was never sent to the client.
- The transcript reducer and `messagesToChat` match a result to the first part with the same id.
- The thread's tool list keys its rows by id.

A provider that issues its own unique ids on the stream does not show it.

## Workaround

The model `resolveAgentModel` builds from a provider config (`agent-model.ts`) is wrapped in `withUniqueToolCallIds` (`packages/agents/src/unique-tool-call-ids.ts`): in what a model streams and returns, an id of the form `tool_<n>` gets a suffix that is new for each model call, in the deltas, the `tool_call` events and the final response alike. The provider's `callId` is unchanged, so requests still name the call the way the provider issued it. Ids a provider issued (`call_…`, `toolu_…`) are not touched. Runs already journaled keep their repeated ids.

## Not done

The fix belongs in the adapter, where the id could be the provider's own `callId` once it arrives. The wrapper can go when Anvia does that.
