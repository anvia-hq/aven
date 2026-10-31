# The Responses API rejects a replayed tool call another provider issued

Status: worked around in `packages/agents` (`withResponsesToolCallIds` in `own-reasoning.ts`, applied by `agent-model.ts`).

## Symptom

A chat that began on one provider and continues on OpenAI (or an Azure OpenAI model) fails on the first request after the switch, after five retries:

```
400 Invalid 'input[1].id': 'toolu_014fPacbDyhPNUTdszUKanve'. Expected an ID that begins with 'fc'.
```

It happens to a bot or a thread whose history holds a tool call from Claude (`toolu_…`) or from a chat-completions model (`call_…`). The person picks the model per message (decision 0007), so nothing prevents the switch.

## Cause

`@anvia/openai` writes each replayed tool call as a Responses `function_call` item with `id: toolCallId` and `call_id: callId ?? toolCallId`. The API requires an item `id` that begins `fc`, and takes any `call_id`; a result is matched to its call by `call_id`.

## Workaround

Before a request, a call whose id does not begin `fc` gets `callId` set to the id it was issued under (so its result, which still names that id, matches) and a `toolCallId` of `fc_<that id>`. Calls the Responses API issued itself, and the stored history, are left as they are. Chat-completions and Anthropic accept any id and are not touched. The sibling rule for reasoning is decision 0050.
