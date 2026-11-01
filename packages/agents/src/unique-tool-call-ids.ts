import type {
  AssistantContentPart,
  CompletionModel,
  CompletionModelStreamEvent,
  CompletionResponse,
} from "@anvia/core";

// Anvia's chat completions adapter names a streamed tool call after its position in the model's
// reply, `tool_0`, `tool_1`, and keeps the provider's own id as `callId`. The next reply starts at
// `tool_0` again, so over a run many calls share an id, and everything that tells calls apart by it
// goes wrong: the run's events announced each id once (the thread showed the first six calls of a
// run and none after), a result was matched to the first call of that name, and a list drew
// duplicate keys (docs/bugs/0006-chat-stream-tool-call-ids-repeat.md). Each reply's positional ids
// get a suffix of their own, so an id is unique in the run; the provider's `callId` still goes back
// to it in requests. Ids a provider issued (`call_…`, `toolu_…`) pass untouched.
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

// One suffix per model call, so the calls of a reply stay distinct from each other and from every
// other reply's.
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

// A proxy, not a copy: a model's methods use its private state, so they must run on the model itself.
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
