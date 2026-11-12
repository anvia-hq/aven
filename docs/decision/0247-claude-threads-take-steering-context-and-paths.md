# Claude threads take steering messages, report context and use real paths

Status: accepted. Fixes 0242 and 0243.

## Context

Three things behaved differently on a Claude thread than on a native one. A message sent while the agent worked showed "Queued" and was never read, because the Claude backend never reported it as applied and the open query only reads input between turns. The Context panel stayed empty because Claude's usage events carried no context size. The instructions named `/workspace`, `/uploads` and `/skills`, which the native agent has rewritten to the machine's real paths.

## Decision

- **A steering message reaches the agent in its next tool result.** The runner keeps it, appends it to the next Aven tool result with a short note, and reports `steer_applied` then. A message that arrives after the last tool call is sent as the next turn when the answer completes, and the run ends only when none is waiting.
- **Usage carries the context.** The last main-thread call's input, cache and output tokens are the used size, and the model's `contextWindow` from the result is the limit.
- **Claude's instructions go through `forPaths`**, as the native agent's do.
- Claude Code's own preset prompt stays under Aven's instructions; replacing it is not done here.

## Consequences

A steering message is read at the agent's next step, as the UI says. A run that uses only Claude's built-in tools reads it when its answer completes.
