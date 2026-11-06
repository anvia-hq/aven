---
name: configure-providers
description: Add, change, switch or remove the person's model providers (OpenAI, Anthropic, Google Gemini, Amazon Bedrock, Azure OpenAI, an OpenAI-compatible server) and pick models. Use when the user wants to connect a provider, change a key or a model, make one the default, or says there is no model, a model is missing, or a provider does not work.
---

# Configuring model providers

A provider is what runs the person's agents: it holds a kind, an API key and, for some kinds, an address and a default model. Providers are the person's own and follow them into every workspace. The first one added becomes the default; a thread picks provider, model and reasoning effort for each message, and each bot has its own choice in Settings > Bots (or follows the default).

## What each kind needs

| Kind                                                 | Address                                                                                                                | Model                                                                            | Key                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------- |
| OpenAI                                               | none                                                                                                                   | optional                                                                         | required                    |
| Anthropic                                            | none                                                                                                                   | optional                                                                         | required                    |
| Google Gemini                                        | none                                                                                                                   | optional                                                                         | required                    |
| Amazon Bedrock                                       | the region, such as `us-east-1`: the form makes `https://bedrock-mantle.<region>.api.aws/v1`; a bot gives that address | required: a Bedrock model id such as `openai.gpt-oss-120b` (the form lists them) | required: a Bedrock API key |
| Azure OpenAI                                         | the resource URL, `https://<resource>.openai.azure.com` (https only, anything after the host is dropped)               | the **deployment name** in that resource, which is not always the model's name   | required                    |
| OpenAI-compatible (Ollama, vLLM, LiteLLM, a gateway) | the server's root, such as `https://gateway.example.com/v1`                                                            | required                                                                         | optional                    |

OpenAI, Anthropic, Google Gemini and Azure can each be added once. Amazon Bedrock can be added once for each region. Bedrock takes only a Bedrock API key (not AWS access keys), reaches the models AWS serves on its `bedrock-mantle` `/v1` endpoint and offers no reasoning effort. A Gemini key comes from Google AI Studio (https://aistudio.google.com/apikey) and is not a Vertex AI credential. An OpenAI-compatible server can be added many times, one for each server.

## 1. Find out what they want

Ask in one message, with your best guess for each answer: which kind, what to call it, the address and model if the kind needs them, whether it should become the default. If the request already says it ("set up my Azure at https://acme.openai.azure.com, deployment gpt-5"), do not ask again.

## 2. If you have the provider tools (a bot)

1. `list_providers` first. If the kind is already there, change it with `update_provider` instead of adding it again.
2. `add_provider` with what you worked out. It starts with **no key**, and is not the default.
3. Right after, call `ask_provider_key`. The person types the key into a masked form in this chat; it is saved to the provider and you never see it. Your turn ends there, and they tell you when it is saved.
4. Then `list_provider_models` to prove it works. For Azure, check the deployment name is in the list; if it is not, fix `modelId` with `update_provider`. For a compatible server, check the model is there.
5. `update_provider` with `isDefault: true` only if they asked for it. A provider with no key cannot be the default.
6. Tell them what you did, and where to pick the model: the composer's model menu in a thread, Settings > Bots for a bot.

Changing a provider's address removes its key (so the key is never sent somewhere a bot chose): ask for it again with `ask_provider_key`. Removing a provider with `remove_provider` deletes its key for good: confirm first.

If the person pastes a key into the chat anyway, do not use or repeat it. Tell them to use the form, and that the key is now in the chat history, so it is worth replacing.

## 3. If you do not have them (a thread's agent, or no tool)

Send the person to Settings > Providers and give them each value:

1. Open Settings > Providers and press **Set up** on the kind's row (or **Add** under Amazon Bedrock and OpenAI-compatible).
2. Fill in: name, address, model or deployment, and the key (they paste it themselves).
3. The form can list the models the key can use; pick one.
4. Use the row's menu to make it the default.

## When it does not work

- **"no model" or the model menu is empty**: there is no provider yet, and the installation has no shared key. Add one.
- **"X has no API key yet"**: the provider was made without its key. Give it one: Settings > Providers > Edit, or ask a bot to show the key form.
- **"This Azure provider has no API key"**: the same, for Azure.
- **A model is missing from the list**: for Azure the list is the resource's deployments, so create the deployment in Azure first; for other kinds only models that can drive an agent are shown.
- **Bedrock says a model is not supported on this route, or it is missing from the list**: Aven reaches the `bedrock-mantle` `/v1` endpoint of the region; a model AWS serves only under another path, or in another region, is not reachable. Pick another model or add the other region. A short-term Bedrock key that expired answers 401: give a new key.
- **Azure says the deployment was not found**: the deployment name, not the model name, goes in the model field.
- **The context card is empty for a compatible server**: it learns the model's window from the server's `GET <address>/model/info` (LiteLLM answers it); without it no window is known and history is kept whole.
- **A reasoning effort is refused**: the model does not take that level. Pick another, or none.
