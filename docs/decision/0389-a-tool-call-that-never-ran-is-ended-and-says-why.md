# A tool call that never ran is ended, and says why

Status: accepted. Builds on decision 0004 (server-owned runs and the SSE protocol).

## Context

A run's tool parts are opened by `tool_start` and closed by `tool_end`. The two do not always pair up.

The runner announces a tool call when the model completes a turn with it (`runs/durable-events.ts`, the `model_completed` case), so a client sees the call at once instead of waiting for the durable operation. But a call whose input the tool rejects never becomes an operation: `@anvia/core` fails it at `prepareToolCall`, hands the model the validation message as an error result, and never calls `execution.tool(...)`, which is the only place that journals `tool_started` and `tool_completed`. The announcement stays open, no `tool_end` ever comes, and nothing else closed it — `applyEvent`'s `done` and `error` did nothing to a running part.

What a person saw was a row that spun forever, and a transcript that kept spinning after a reload. `spawn_agent` made it loudest: the model wrote a task list without the required `type`, the call was rejected, and every subagent card it had already drawn kept loading while the reason appeared nowhere — a `spawn_agent` part is drawn as its subagents, so the tool's own output was never shown at all.

## Decision

- The runner closes what it opened. When the durable run reaches its status, `durable-events.ts` sends a `tool_end` with `status: "error"` and `TOOL_DID_NOT_RUN` for every call it announced and never completed. A run that is `waiting` for an answer closes nothing: its call is suspended, not finished.
- The reducer is the safety net (`protocol/events.ts`). On `done` and on `error`, `endRunningTools` ends every tool still `running`, with the same message, and ends its subagents with it. A transcript saved before this loads right, and a client that missed the run's end is left with no spinner. The array is returned as it was when nothing was running, so an event that changes nothing is still no change.
- The platform shows why the call failed. A `spawn_agent` part whose status is `error` draws the tool's own output above its cards (`thread-message.tsx`), because the tool's own result has nowhere else to go once the part is drawn as subagents.

## Consequences

- A call still running when the run is cancelled or fails now reads as an error, which it is: nothing will report on it again.
- The message is the same wherever it comes from, so a client need not tell a rejected input from a run that ended under a call.
- A model that omits a required field is still told so by the tool, before any of this; this only makes sure the person is told too.
