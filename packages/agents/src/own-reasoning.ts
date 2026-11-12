import type { CompletionModel, CompletionRequest, Message, ReasoningPart } from "@anvia/core";

type ReasoningOwnership = (id: string | undefined) => boolean;

export const ownedByResponsesApi: ReasoningOwnership = (id) => id?.startsWith("rs_") ?? false;
export const ownedByAnthropic: ReasoningOwnership = (id) => id?.startsWith("thinking_") ?? false;

function keepingReasoning(message: Message, keep: (part: ReasoningPart) => boolean): Message[] {
  if (message.role !== "assistant" || typeof message.content === "string") return [message];

  const content = message.content.filter((part) => part.type !== "reasoning" || keep(part));

  if (content.length === message.content.length) return [message];

  return content.length > 0 ? [{ ...message, content }] : [];
}

const onlyOwn = (history: Message[], owns: ReasoningOwnership) =>
  history.flatMap((message) => keepingReasoning(message, (part) => owns(part.id)));

function onlyThisTurns(history: Message[]) {
  const start = history.findLastIndex((message) => message.role === "user");
  return history.flatMap((message, index) =>
    index > start ? [message] : keepingReasoning(message, () => false),
  );
}

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

export function withAnthropicReasoning<T extends CompletionModel>(model: T): T {
  return withChatHistory(model, (history) => onlyThisTurns(onlyOwn(history, ownedByAnthropic)));
}

function withoutEmptyText(history: Message[]): Message[] {
  return history.flatMap((message): Message[] => {
    if (message.role !== "assistant") return [message];

    if (typeof message.content === "string") return message.content.trim() === "" ? [] : [message];

    const content = message.content.filter(
      (part) => part.type !== "text" || part.text.trim() !== "",
    );

    if (content.length === message.content.length) return [message];

    return content.length > 0 ? [{ ...message, content }] : [];
  });
}

export function withoutEmptyAssistantText<T extends CompletionModel>(model: T): T {
  return withChatHistory(model, withoutEmptyText);
}
