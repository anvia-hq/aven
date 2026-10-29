# The model and reasoning effort are chosen per message

Status: accepted. Supersedes the "Whoever sends the message pays" rule of `0006`; what it says about background jobs and restarting a run is superseded by 0012.

## Context

`0006` ran every message on the sender's default provider, with the provider's configured model. The prompt composer now lets the sender pick the provider, the model and a reasoning effort for each message.

## Decision

- **`POST /threads/:id/messages` takes optional `providerId`, `modelId` and `reasoningEffort`.** Without them the sender's default provider runs, as before; without a provider, the environment fallback.
- **The provider is looked up by `(providerId, user.id)`**, never by id alone, so a message cannot run on someone else's key. An unknown or foreign provider is a 422, as is a model or effort the message cannot run with. The check happens before the 202; after it a bad value would only show up as a failed run.
- **Effort levels belong to the model and come from the SDK**, not from a list of our own: `reasoningControlsFor` reads the model's `controls.reasoningEffort` (`packages/agents/src/model.ts`). The SDK rejects a level the model does not support, so the server validates against the same list. Models without the control (older ids, dated Anthropic ids, every OpenAI-compatible server) get none, and are never sent a `reasoning_effort` they might reject.
- **`GET /providers/:id/models` returns `{ models, efforts }`**, where `efforts` maps a model id to `{ options, defaultValue }` for the models that have levels. The composer shows a slider with one step per option, hidden when there are fewer than two, and resets to the model's default when the model changes.
- **A run restarted by a finished background job reuses the last sender's choice** (`Channel.lastSender`), resolved again at that moment. If the provider or model has since gone, their default provider runs it.
- **The composer's choice is a preference, not a source of truth.** It is saved in the browser (`aven.model-selection`) and checked against the user's current providers on every render; an id that is no longer theirs is ignored. It is cleared on sign-out.
- **Gate: only models that can drive the agent are offered.** `GET /models` lists everything a key can reach, so the openai and anthropic lists go through the models.dev catalog (<https://models.dev/api.json>, `providers/model-catalog.ts`): a model must support tool calls and text output and not be deprecated. A message that names a model the catalog says cannot run is a 422. OpenAI-compatible servers are never gated.
- **Fallback:** an id the catalog does not know (a model newer than the catalog), or any id while models.dev is unreachable, is judged by name (`claude-*` for Anthropic; `gpt-*`, `o<digit>` and `chatgpt-*` for OpenAI minus embedding, speech, image, realtime, moderation and search ids). The catalog is cached for 24 hours; a failed refresh keeps serving the old one and retries after 5 minutes. `MODEL_CATALOG_URL` overrides the source; empty turns the lookup off.
- **Effort levels come from the SDK first, then from models.dev.** The SDK throws on a level it does not list, so its list wins for the models it knows. For a model newer than the SDK (the 5.5 family while `@anvia/*` lags) the server takes the `effort` values models.dev lists and builds the model with them (`ModelConfig.effortLevels`, which becomes the model's `controls`); the SDK then accepts the level and sends it as the provider's own parameter. models.dev gives no default level for these, so the slider starts at "medium" when present. Models with other kinds of reasoning (Anthropic `budget_tokens`, on/off toggles) get no slider.
- The provider's model list is fetched once per provider when the composer needs it and kept until sign-out.

## Consequences

- The sender still pays, but now for the model they chose.
- A model newer than both the catalog and the SDK is offered by name but has no effort slider until one of them learns it.
- Changing the model does not apply mid-run: the composer is disabled while a run is live.
