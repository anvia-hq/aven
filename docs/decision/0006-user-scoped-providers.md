# Model providers belong to the user

Status: accepted

## Context

The agent's model came from the environment (`AGENT_PROVIDER`, `AGENT_MODEL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`), so every user and workspace shared one provider and the operator paid for all of it (`0003`, `0004`).

## Decision

- **Providers are tied to the user, not the organization.** `providers` rows have `user_id` (no `organization_id`); the routes (`/providers`) use `auth: true` without `org: true` and always filter by the signed-in user. Someone else's provider is a 404.
- **Kinds:** `openai`, `anthropic`, `openai-compatible` (base URL and model required, key optional, chat completions API). Each user may have several and exactly one default (partial unique index). The first one added becomes the default; deleting the default promotes the oldest remaining.
- **Keys are encrypted at rest** with AES-256-GCM using `PROVIDER_ENCRYPTION_KEY` (32 bytes, base64). The API never returns a key, only `keyHint` (last 4 characters) and `hasKey`. Rotating the env key makes stored keys unreadable.
- **Models are listed from the provider** (`GET <base>/models`; Anthropic with `x-api-key`). `POST /providers/models` takes a key and URL from the add dialog before anything is saved; `GET /providers/:id/models` uses a saved key. The model field falls back to free text if listing fails.
- **Anthropic runs use automatic prompt caching** (<https://platform.claude.com/docs/en/build-with-claude/prompt-caching>): `createCodingAgent` passes `providerOptions: { cache_control: { type: "ephemeral" } }` (`providerOptionsFor` in `packages/agents/src/model.ts`), so the API caches tools, system and earlier messages and moves the breakpoint forward each turn of the tool loop. Default 5 minute TTL; prompts under the model's minimum are not cached and no error is returned. Other kinds get no extra options.
- **Whoever sends the message pays.** `POST /threads/:id/messages` resolves the sender's default provider and passes it to `RunManager.start`. A run restarted by a finished background job uses the provider of the last person who sent a message in that thread, resolved again at that moment.
- **Environment fallback is kept.** A sender with no provider runs on `AGENT_PROVIDER` / `AGENT_MODEL` and the env keys, as before. If neither exists, starting fails with the existing 503 message.

## Consequences

- The env provider vars are now a shared fallback, not the configuration.
- The control-plane fetches user-supplied base URLs server-side (needed for local servers such as Ollama). Only signed-in users can trigger it.
