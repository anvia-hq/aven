# The Responses API rejects a replayed tool call another provider issued

Status: fixed upstream in `@anvia/openai` 1.3.7 (and `@anvia/azure` 0.1.9). The local workaround, `withResponsesToolCallIds`, was removed when upgrading to it.

## Symptom

A chat that began on one provider and continues on OpenAI (or an Azure OpenAI model) fails on the first request after the switch, after five retries:

```
400 Invalid 'input[1].id': 'toolu_014fPacbDyhPNUTdszUKanve'. Expected an ID that begins with 'fc'.
```

It happens to a bot or a thread whose history holds a tool call from Claude (`toolu_…`) or from a chat-completions model (`call_…`). The person picks the model per message (decision 0007), so nothing prevents the switch.

## Cause

`@anvia/openai` writes each replayed tool call as a Responses `function_call` item with `id: toolCallId` and `call_id: callId ?? toolCallId`. The API requires an item `id` that begins `fc`, and takes any `call_id`; a result is matched to its call by `call_id`.

## Workaround (removed)

Before a request, a call whose id did not begin `fc` got `callId` set to the id it was issued under (so its result, which still names that id, matched) and a `toolCallId` of `fc_<that id>`. Calls the Responses API issued itself, and the stored history, were left as they were.

## Upstream fix

`@anvia/openai` 1.3.7 reads the origin an assistant message carries (`metadata.anvia.generation.provider`) and leaves the item `id` out of a call that came from another provider, or from chat completions (`call_…`), keeping `call_id`, which links the result. A message with no origin keeps its id, so a history older than that metadata would fail again; every assistant message with a tool call in the local and the homelab databases carries it (4,537 of 4,537). `agent-model.test.ts` runs the real model against a local server and fails if an upgrade stops leaving the id out. The sibling rule for reasoning, decision 0050, is still ours: Anvia does not drop another provider's reasoning for OpenAI.
