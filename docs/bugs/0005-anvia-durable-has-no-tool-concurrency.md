# `@anvia/durable` has no way to set `toolConcurrency`

Status: worked around with a local patch (`patches/@anvia%2Fdurable@0.13.0.patch`, decision 0070). Still absent upstream in 0.13.0.

## Symptom

The tool calls of one model turn in a thread's run happen one after another, however many the model asks for at once.

## Cause

`toolConcurrency` is one of Anvia's per-run settings (`AgentRunSettings`, default 1). `@anvia/durable` starts an agent with `{ ...run.input, trace, abortSignal, retries: false }`, and `run.input` holds only what `submit` was given: the prompt and the trace. Neither `submit` nor an agent registration can carry the setting. (`@anvia/core` also keeps it at 1 for an agent that has a question tool or a tool that may require approval.)

## Workaround

The patch adds an optional `toolConcurrency` to `DurableAgentRegistration`, validated in `registrations()` and passed in the options durable builds for a run, with its type. `DurableRuns` sets it. To drop the patch once Anvia has it: remove the entry from `patchedDependencies` in the root `package.json`, delete the file in `patches/`, run `bun install`, and set the setting however upstream spells it.

The patch was regenerated with `bun patch` for 0.13.0, preserving the same validation and forwarding. Its new compatibility report still lists `toolConcurrency` as unavailable **per run**: this patch exposes a fixed registration setting, not a per-run override. Agent retries are handled separately as described in decision 0112.
