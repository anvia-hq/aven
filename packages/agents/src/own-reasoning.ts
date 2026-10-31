import type { CompletionModel, CompletionRequest, Message, ReasoningPart } from "@anvia/core";

// A person picks the model per message (decision 0007), so one thread's history can hold reasoning
// from several providers. A provider takes back only its own: the Responses API wants the ids it
// issued (`rs_…`) and rejects Anthropic's `thinking_0` with a 400, and Anthropic wants its signed
// thinking blocks. Reasoning another provider made is not needed to continue, so it is left out of
// what a request replays. The run's own reasoning, made by this model, passes untouched.
type ReasoningOwnership = (id: string | undefined) => boolean;

export const ownedByResponsesApi: ReasoningOwnership = (id) => id?.startsWith("rs_") ?? false;
export const ownedByAnthropic: ReasoningOwnership = (id) => id?.startsWith("thinking_") ?? false;

// The message with only the reasoning `keep` accepts; none when nothing else was in it, since an
// assistant message of nothing but dropped thinking would be an empty turn.
function keepingReasoning(message: Message, keep: (part: ReasoningPart) => boolean): Message[] {
  if (message.role !== "assistant" || typeof message.content === "string") return [message];
  const content = message.content.filter((part) => part.type !== "reasoning" || keep(part));
  if (content.length === message.content.length) return [message];
  return content.length > 0 ? [{ ...message, content }] : [];
}

const onlyOwn = (history: Message[], owns: ReasoningOwnership) =>
  history.flatMap((message) => keepingReasoning(message, (part) => owns(part.id)));

// Anthropic binds a thinking block's signature to what preceded it, so thinking from an earlier turn
// is refused once anything before it differs, such as the tools of a later run (bug 0001). Only the
// turn in progress, after the person's latest message, needs its thinking back: its tool calls
// continue from it.
function onlyThisTurns(history: Message[]) {
  const start = history.findLastIndex((message) => message.role === "user");
  return history.flatMap((message, index) =>
    index > start ? [message] : keepingReasoning(message, () => false),
  );
}

// A proxy, not a copy: a model's methods use its private state, so they must run on the model itself.
function withChatHistory<T extends CompletionModel>(
  model: T,
  change: (history: Message[]) => Message[],
): T {
  const clean = (request: CompletionRequest) => ({
    ...request,
    chatHistory: change(request.chatHistory),
  });
  return new Proxy(model, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (key === "completion" || key === "streamCompletion" || key === "traceRequest")
        return (request: CompletionRequest, ...rest: unknown[]) =>
          (value as (...args: unknown[]) => unknown).call(target, clean(request), ...rest);
      return value.bind(target);
    },
  });
}

export function withOwnReasoning<T extends CompletionModel>(model: T, owns: ReasoningOwnership): T {
  return withChatHistory(model, (history) => onlyOwn(history, owns));
}

// The Responses API names each tool call it replays with an item id that must begin `fc`, and
// refuses what another provider issued: Anthropic's `toolu_…`, a chat-completions `call_…`. The call
// and its result are matched by `call_id`, which may be anything, so the id it was issued under
// becomes that, and the item gets an id of the kind this API takes. What the API issued itself, and
// the results (which carry no item id), pass untouched.
const ISSUED_BY_RESPONSES_API = /^fc/;

function withResponsesItemIds(message: Message): Message {
  if (message.role !== "assistant" || typeof message.content === "string") return message;
  const content = message.content.map((part) =>
    part.type !== "tool-call" || ISSUED_BY_RESPONSES_API.test(part.toolCallId)
      ? part
      : { ...part, callId: part.callId ?? part.toolCallId, toolCallId: `fc_${part.toolCallId}` },
  );
  return { ...message, content };
}

/** Tool calls another provider issued, given ids the Responses API takes back. */
export function withResponsesToolCallIds<T extends CompletionModel>(model: T): T {
  return withChatHistory(model, (history) => history.map(withResponsesItemIds));
}

/** Anthropic's thinking, only its own and only from the turn in progress. */
export function withAnthropicReasoning<T extends CompletionModel>(model: T): T {
  return withChatHistory(model, (history) => onlyThisTurns(onlyOwn(history, ownedByAnthropic)));
}
