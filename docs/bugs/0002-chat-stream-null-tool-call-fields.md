# The chat completions stream rejects tool calls whose continuation chunks carry nulls

Status: worked around in `packages/agents` (`null-free-stream.ts`).

## Symptom

A run on an Azure deployment of a non-OpenAI model (DeepSeek-V4.1-Flash) fails as soon as the model calls a tool, after five retries:

```
Completion provider returned an invalid tool call.
```

The same model answers fine without tools, and OpenAI's models are fine.

## Cause

On chat completions, Azure's DeepSeek sends every continuation of a streamed tool call with explicit nulls for the fields it does not set:

```
{"tool_calls":[{"id":null,"index":0,"type":"function","function":{"name":null,"arguments":"{"}}]}
```

`@anvia/openai`'s chat stream mapping accepts a missing `id` or `name` but throws `invalidToolCallError` for a `null` one (`assertOptionalToolCallString`). The error carries no tool call id, so the message does not say which field it was. Reproduced against the live resource with a one-tool agent; the retries (decision 0021's `modelRetry`) fail the same way each time.

It appeared when Azure's non-OpenAI models moved to chat completions to get a real stream (decision 0026). The Responses API does not send these nulls.

## Workaround

`createModel` gives `AzureOpenAIClient` a `fetch` that removes null properties from every JSON line of a `text/event-stream` response (`nullFreeStream`). Verified with DeepSeek-V4.1-Flash and gpt-5.5 on the live resource.

## Not done

OpenAI-compatible servers on chat completions (vLLM, for one) may send the same nulls; `OpenAIClient` takes no `fetch` here, so they are not covered. Remove the wrapper when the SDK accepts null as missing.
