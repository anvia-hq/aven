# Anthropic rejects thinking blocks replayed from an earlier run

Status: the workaround below (`withoutStoredReasoning`) was removed as unused; see "Now".

## Symptom

A follow-up message in a thread fails with a 400 from Anthropic:

```
messages.1.content.5: Invalid `signature` in `thinking` block. The block is bound to a different
conversation. Remove the block, or set `thinking.block_binding.prefix_mismatch_behavior` to
"drop_block". That setting requires th…
```

It happens only on a thread whose earlier run produced thinking, which needs a reasoning effort on a model that has no default effort (Claude Haiku 5.5, for one).

## Cause

A thinking block's signature is bound to the conversation it was produced in. A run saves its messages, thinking included, and the next run replays them. The API rejects a block when what precedes it is not the same as when it was signed. Changing the tool list between two runs reproduces it, and so does replaying a thread stored by an earlier run in our own app. Changing the reasoning effort or the model between runs does not.

Checked against the live API with `claude-haiku-5-5` on the real stored history of a thread that failed.

## Workaround (removed)

An Anthropic run starts from the stored history without its reasoning parts (`createCodingAgent` wraps the store with `withoutStoredReasoning`). Earlier thinking is not needed to continue, and a run's own tool loop keeps its thinking in memory, since history is loaded once at the start of a run. The reasoning stays in the database; it is only not sent back. Other providers are untouched.

An assistant message that held nothing but thinking is dropped from the replayed history.

## Now

Since runs go through `@anvia/durable` (decision 0021), the runner's agent has no memory store: its history is durable's own, so the wrapper above was never on a production run's path and was removed with the agent's `memory` option. The live path is `withOwnReasoning` (`packages/agents/src/own-reasoning.ts`), which `createCodingAgent` puts around an Anthropic model: each request keeps only reasoning whose id Anthropic issued (`thinking_…`) and leaves out another provider's. It does not drop Anthropic's own thinking from earlier runs. Whether that history still triggers this error has not been checked against the live API.

## Not done

The API's own remedy, `thinking.block_binding.prefix_mismatch_behavior: "drop_block"`, was not tried: its error message is cut off before saying what the setting requires.
