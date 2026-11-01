# A gateway says which reasoning levels its models take

Status: accepted. Extends 0006 and 0007 (the model and its effort are chosen per message) and the gateway context window of `gateway-context` (now `gateway-info.ts`).

## Context

An OpenAI-compatible provider never offered a reasoning slider: models.dev knows nothing of a server the person runs, and sending a `reasoning_effort` a server does not know can be refused. A LiteLLM gateway can say what it takes. Its `/model/info` lists, for a model that takes an effort, `supports_reasoning_effort: true` and `reasoning_effort_levels` (the DevScale gateway's `muse-spark-1.3-contributor` lists `minimal` to `max`; 12 of its 23 models list some).

## Decision

- The control plane reads `reasoning_effort_levels` from the provider's own `/model/info`, with the provider's key, only for a model with `supports_reasoning_effort` true, and offers exactly those levels (`effortsFor` in `model-list.ts`, `gateway-info.ts`). Levels are never guessed: a gateway that lists none gives no slider, as before.
- The levels travel as `effortLevels`, as models.dev's do for models the SDK does not know, and `createModel` builds an OpenAI-compatible model with them as its effort control, so the chat completions request carries `reasoning_effort` (`packages/agents/src/model.ts`).
- One `/model/info` answer serves every model of a gateway, kept an hour per address and key, and models asked for at once share the request in flight: listing a provider's models asks the gateway once, not once per model. An answer that is none is not kept.

## Consequences

- Press Refetch models on a provider to pick up levels an older listing did not have.
- A gateway that supports an effort without saying which levels gets no slider; the levels would be a guess.
