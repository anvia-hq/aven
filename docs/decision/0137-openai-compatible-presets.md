# OpenAI-compatible services have panels of their own

Status: accepted.

## Context

Many vendors serve the OpenAI API at their own address (OpenRouter, Groq, DeepSeek, Mistral, xAI, and Ollama on the person's machine). The `openai-compatible` kind already runs them all (decision 0006 and the gateway's `/chat/completions` route), but a person had to know each address, and the services were hidden inside the generic panel. They should be as easy to find as Anthropic or Gemini.

## Decision

- **A panel each, no new kind.** Each service is a row of `COMPATIBLE_PRESETS` (`apps/platform/src/modules/providers/presets.ts`): id, name, description, base URL, whether it needs a key, an example model and a key placeholder. Settings > Providers lists each as its own row with **Set up**, beside OpenAI and Anthropic. Its dialog asks only for the key and the model; the name and the address are fixed. What is saved is a plain `openai-compatible` provider, so the server, the API and the wire are unchanged.
- **One credential each.** A saved provider belongs to a panel when its kind is `openai-compatible` and its address is the preset's (`presetOf`, trailing slashes ignored). Once one exists, the panel leaves the "set up" list, shows under Connected and can be edited with the same dialog. Ollama keeps its key optional.
- **The generic panel stays** for any other server (vLLM, LiteLLM, an Ollama on another host); it has the name and address fields and can be added many times. A provider whose address is edited away from a preset's becomes a generic one.
- **The addresses**: OpenRouter `https://openrouter.ai/api/v1`, Groq `https://api.groq.com/openai/v1`, DeepSeek `https://api.deepseek.com`, Mistral `https://api.mistral.ai/v1`, xAI `https://api.x.ai/v1`, Ollama `http://localhost:11434/v1`. They are from each vendor's documentation as known when this was written, not fetched at run time.
- **The configure-providers skill lists the same table**, so a bot that is asked for "my Groq" adds an `openai-compatible` provider with that address.

## Consequences

- An address that a vendor changes is a one-line edit in `presets.ts` and in the skill (they must agree); providers saved with the old address then appear under the generic panel.
- Panels are told apart from generic servers by address, not by a stored kind. If a service ever needs behaviour of its own on the server, it should become a real kind then.
- Models still come from the server's own `GET <base>/models`; no effort levels are offered unless the server lists them.
- Ollama on `localhost` is reached from the control plane, which must run on the same machine.
