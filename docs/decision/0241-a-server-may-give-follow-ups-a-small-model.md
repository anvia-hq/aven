# A server may give the follow-up suggestions a small model

Status: accepted. Extends 0226 (follow-up suggestions) and 0240 (a server's default decision model).

## Context

Follow-up suggestions need a small model, chosen by the person from their own providers (Settings > Small models). A person with no provider of their own cannot use them, and on a server that serves people who bring nothing, nobody would.

## Decision

- **A server may set a small model** with `SMALL_MODEL_API_KEY`, `SMALL_MODEL_PROVIDER` (`anthropic`, `openai` or `gemini`; `anthropic` when empty) and `SMALL_MODEL_ID`, which is required with the key since a provider's default model is not a small one. Without a key there is none and nothing changes. A provider it does not know, or a key without a model, stops the server at start-up.
- **A person's own provider wins.** A person who chose a provider uses it; with none, they use the server's. Turning the switch on picks the server's when there is one, instead of the person's default provider, and the model row says "Provided by this server".
- **It stays opt-in.** The switch is off until a person turns it on, since turning it on sends the end of their threads to the operator's provider. The setting offers the model; it does not enable anyone.
- **The key never leaves the server.** The preferences answer carries only the server model's provider and model.

## Consequences

- The operator pays for the calls of everyone who turns it on. The decision gate of 0238 skips short replies first, and nothing caps the spending.
- A person with no provider can use follow-ups with one switch; before, they had to add a provider first.
- The server's model, being one for everyone, is not per-workspace: a workspace that wants its threads kept from the operator's provider has its people choose their own.
