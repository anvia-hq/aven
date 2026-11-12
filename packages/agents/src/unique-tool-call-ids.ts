import type {
  AssistantContentPart,
  CompletionModel,
  CompletionModelStreamEvent,
  CompletionResponse,
} from "@anvia/core";

const POSITIONAL = /^tool_\d+$/;

type Rename = (id: string) => string;

function renameCalls(choice: AssistantContentPart[], rename: Rename): AssistantContentPart[] {
  return choice.map((part) =>
    part.type === "tool-call" ? { ...part, toolCallId: rename(part.toolCallId) } : part,
  );
}

function renameResponse<R>(response: CompletionResponse<R>, rename: Rename) {
  return { ...response, choice: renameCalls(response.choice, rename) };
}

function renameEvent<R>(
  event: CompletionModelStreamEvent<R>,
  rename: Rename,
): CompletionModelStreamEvent<R> {
  switch (event.type) {
    case "tool_call_delta":
      return { ...event, id: rename(event.id) };
    case "tool_call":
      return {
        ...event,
        toolCall: { ...event.toolCall, toolCallId: rename(event.toolCall.toolCallId) },
      };
    case "final":
      return { ...event, response: renameResponse(event.response, rename) };
    default:
      return event;
  }
}

function renamer(): Rename {
  const suffix = crypto.randomUUID().slice(0, 8);
  return (id) => (POSITIONAL.test(id) ? `${id}-${suffix}` : id);
}

async function* renamedStream<R>(
  stream: AsyncIterable<CompletionModelStreamEvent<R>>,
  rename: Rename,
) {
  for await (const event of stream) yield renameEvent(event, rename);
}

export function withUniqueToolCallIds<T extends CompletionModel>(model: T): T {
  return new Proxy(model, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);

      if (typeof value !== "function") return value;

      const call = (...args: unknown[]) =>
        (value as (...args: unknown[]) => unknown).apply(target, args);

      if (key === "streamCompletion")
        return (...args: unknown[]) =>
          renamedStream(call(...args) as AsyncIterable<CompletionModelStreamEvent>, renamer());

      if (key === "completion")
        return async (...args: unknown[]) =>
          renameResponse((await call(...args)) as CompletionResponse, renamer());

      return value.bind(target);
    },
  });
}
