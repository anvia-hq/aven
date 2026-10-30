import {
  Usage,
  type AssistantContentPart,
  type CompletionRequest,
  type CompletionResponse,
} from "@anvia/core";
import type { StreamingCompletionModel } from "@anvia/core/completion";

export type ScriptStep =
  | AssistantContentPart[]
  | ((request: CompletionRequest) => AssistantContentPart[] | Promise<AssistantContentPart[]>);

// A model that replays a fixed script, one step per completion call, for tests that must not
// reach a provider. Fails loudly if the agent asks for more steps than were scripted.
export function scriptedModel(steps: ScriptStep[]): StreamingCompletionModel {
  let next = 0;
  const respond = async (request: CompletionRequest): Promise<CompletionResponse> => {
    const step = steps[next++];
    if (!step) throw new Error(`scriptedModel: no step ${next} scripted`);
    const choice = typeof step === "function" ? await step(request) : step;
    const calls = choice.some((part) => part.type === "tool-call");
    return {
      choice,
      usage: Usage.empty(),
      finishReason: calls ? "tool-calls" : "stop",
      rawResponse: null,
    };
  };

  return {
    provider: "scripted",
    modelId: "scripted",
    capabilities: {
      streaming: true,
      tools: true,
      toolChoice: true,
      // Takes the images users attach (decision 0034), as every provider the agent runs on does.
      imageInput: true,
      documentInput: false,
      outputSchema: false,
      reasoning: false,
    },
    completion: respond,
    async *streamCompletion(request) {
      const response = await respond(request);
      for (const part of response.choice) {
        if (part.type === "text") yield { type: "text_delta", delta: part.text };
        if (part.type === "tool-call") yield { type: "tool_call", toolCall: part };
      }
      yield { type: "final", response };
    },
  };
}

export const text = (value: string): AssistantContentPart => ({ type: "text", text: value });

export const toolCall = (
  toolName: string,
  input: Record<string, string | number | boolean>,
  toolCallId = `call_${toolName}_${Math.random().toString(36).slice(2, 8)}`,
): AssistantContentPart => ({ type: "tool-call", toolCallId, toolName, input });
