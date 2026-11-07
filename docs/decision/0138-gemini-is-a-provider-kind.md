# Google Gemini is a provider kind

Status: accepted.

## Context

Providers were `openai`, `anthropic`, `azure` and `openai-compatible`. Google's Gemini API has an OpenAI-compatible endpoint, but `@anvia/gemini` talks Gemini's own protocol (function calls, thinking levels and budgets) through `@google/genai`, and that is the better fit for the agent.

## Decision

- **A new kind, `gemini`.** It has a key and an optional model, and no address: like `openai` and `anthropic` it has no `baseUrl` column value. The key is a Google AI Studio key (`GEMINI_API_KEY` is the fallback the control plane's environment can give, and `AGENT_PROVIDER=gemini` is allowed). The default model is `gemini-2.5-pro` (`DEFAULT_MODEL_IDS`). One per user, like the other vendors.
- **`@anvia/gemini` has no base URL option**, so `createModel` gives it a `GoogleGenAI` client built with `httpOptions.baseUrl`; `@google/genai` is a direct dependency of `@aven/agents`, pinned to the version `@anvia/gemini` uses.
- **Through the gateway like the others.** The runner points the SDK at `/runtimes/gateway/gemini`. The control plane only forwards `POST /v1beta/models/<id>:generateContent` and `:streamGenerateContent`, replaces `<id>` with the sender's model, keeps only the `alt=sse` query and adds the key as `x-goog-api-key`. Gemini has no `model` field in the body, so there is nothing else to pin. The reasoning effort is not pinned either: Gemini carries it in `generationConfig.thinkingConfig`, whose shape depends on the model (budget for 2.5, level for 3), so the runner's own request is trusted for it, as the effort only changes cost.
- **Models** are listed from `GET /v1beta/models` (the ones that support `generateContent`) and filtered through models.dev's `google` entries (`CATALOG_KEYS`), with a name check for ids it lacks.

## Consequences

- The wire version is 43: an older runner would build an Anthropic client for a Gemini run.
- Vertex AI is a different credential and endpoint and is not covered by this kind.
