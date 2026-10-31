import type { CompletionModel, CompletionRequest, Message } from "@anvia/core";

// A person picks the model per message (decision 0007), so one thread's history can hold reasoning
// from several providers. A provider takes back only its own: the Responses API wants the ids it
// issued (`rs_…`) and rejects Anthropic's `thinking_0` with a 400, and Anthropic wants its signed
// thinking blocks. Reasoning another provider made is not needed to continue, so it is left out of
// what a request replays. The run's own reasoning, made by this model, passes untouched.
export type ReasoningOwnership = (id: string | undefined) => boolean;

export const ownedByResponsesApi: ReasoningOwnership = (id) => id?.startsWith("rs_") ?? false;
export const ownedByAnthropic: ReasoningOwnership = (id) => id?.startsWith("thinking_") ?? false;

function onlyOwn(history: Message[], owns: ReasoningOwnership): Message[] {
  return history.flatMap((message) => {
    if (message.role !== "assistant" || typeof message.content === "string") return [message];
    const content = message.content.filter((part) => part.type !== "reasoning" || owns(part.id));
    if (content.length === message.content.length) return [message];
    // An assistant message of nothing but another provider's thinking would be an empty turn.
    return content.length > 0 ? [{ ...message, content }] : [];
  });
}

// A proxy, not a copy: a model's methods use its private state, so they must run on the model itself.
export function withOwnReasoning<T extends CompletionModel>(model: T, owns: ReasoningOwnership): T {
  const clean = (request: CompletionRequest) => ({
    ...request,
    chatHistory: onlyOwn(request.chatHistory, owns),
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
