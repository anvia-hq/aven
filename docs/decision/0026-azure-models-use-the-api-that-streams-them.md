# Azure models use the API that streams them

Status: accepted. Refines the Azure model client of [0019](0019-azure-openai-provider.md), which used the Responses API for every deployment.

## Context

One Azure resource serves OpenAI's models and others (DeepSeek, Grok, ...). Timing a deployment's raw stream showed that the Responses API returns the others' answers whole: DeepSeek-V4.1-Flash sent nothing until it had finished, then 14 to 47 events within about 50 ms, so the thread showed "Thinking…" and then the full answer at once. The same model on chat completions streamed over the length of the answer, and OpenAI's models stream on both. The control plane's gateway passes the body through unbuffered, so the burst was Azure's.

## Decision

- `createModel` picks the API by the deployment's name (`azureApiFor`): names of OpenAI's families (`gpt-`, `o<digit>`, `chatgpt-`, `codex`) use the Responses API, everything else chat completions. A deployment named unlike its model is taken for another vendor's, which chat completions serves too.
- The gateway already forwards both paths for Azure, and `pinOpenAiEffort` already handles each path's effort parameter.

## Consequences

- A deployment with an OpenAI model under a custom name runs on chat completions: it streams, and loses only what is specific to the Responses API.
- Through the real model path, DeepSeek-V4.1-Flash streams 128 deltas over 5.2 s, and gpt-5.5 is unchanged.
