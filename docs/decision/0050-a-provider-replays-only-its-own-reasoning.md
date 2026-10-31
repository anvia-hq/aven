# A provider replays only the reasoning it made

Status: accepted. Follows from `0007` (the model is chosen per message).

## Context

A thread keeps one history, but each message can run on a different provider. Reasoning in that history is private to the provider that made it: the Responses API (OpenAI, and Azure's OpenAI models) issues ids that begin `rs_` and answers a replayed `thinking_0`, which the Anthropic adapter makes, with `400 Invalid 'input[75].id': 'thinking_0'. Expected an ID that begins with 'rs'.` Anthropic in turn wants its own signed blocks (`docs/bugs/0001`). A thread that ran on Claude and then on an Azure GPT model stopped working.

## Decision

- **`withOwnReasoning`** (`packages/agents/src/own-reasoning.ts`) wraps the model of a run and removes from each request's history the reasoning parts the provider does not recognise: not `rs_…` for the Responses API, not `thinking_…` for Anthropic. An assistant message left with nothing is dropped. A wrapper on the model, because durable agents refuse middleware, and the history comes from durable's journal, not our memory store.
- The reasoning of the run in progress is the model's own and passes untouched; the stored history is not changed.
- Chat-completions providers are left alone: they do not replay reasoning ids.

## Consequences

- Switching model in the middle of a thread works.
- Reasoning from another provider is not seen by the model; it is not needed to continue.
