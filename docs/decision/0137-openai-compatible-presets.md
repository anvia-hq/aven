# OpenAI-compatible presets fill the form

Status: accepted.

## Context

Many vendors serve the OpenAI API at their own address (OpenRouter, Groq, DeepSeek, Mistral, xAI, and Ollama on the person's machine). The `openai-compatible` kind already runs them all (decision 0006 and the gateway's `/chat/completions` route), but the form asked the person to know each address. opencode relies on models.dev and `openai-compatible` the same way for most of its vendors.

## Decision

- **No new kind.** A preset is a row of `COMPATIBLE_PRESETS` (`apps/platform/src/modules/providers/presets.ts`): id, name, base URL, whether the service needs a key, an example model and a key placeholder. Pressing one in the Add dialog of the OpenAI-compatible kind (`components/compatible-presets.tsx`) fills the Name and Base URL fields, marks the key required for the services that need one (Ollama, local, keeps it optional) and shows the example model as the placeholder; pressing it again lets go. What is saved is a plain `openai-compatible` provider, so the server, the API and existing providers are unchanged.
- **The addresses**: OpenRouter `https://openrouter.ai/api/v1`, Groq `https://api.groq.com/openai/v1`, DeepSeek `https://api.deepseek.com`, Mistral `https://api.mistral.ai/v1`, xAI `https://api.x.ai/v1`, Ollama `http://localhost:11434/v1`. They are from each vendor's documentation as known when this was written, not fetched at run time; the person can edit the address.
- **The configure-providers skill lists the same table**, so a bot that is asked for "my Groq" adds an `openai-compatible` provider with that address.

## Consequences

- An address that a vendor changes is a one-line edit in `presets.ts` and in the skill (the skill and the presets must agree).
- Models still come from the server's own `GET <base>/models`; no effort levels are offered unless the server lists them (a LiteLLM-style gateway).
- Ollama on `localhost` is reached from the control plane, which must run on the same machine.
